import { deflate } from "pako";

export interface PdfPage {
  canvas: HTMLCanvasElement;
  title?: string;
  width?: number;
  height?: number;
}

export interface PdfMetadata {
  title?: string;
  creator?: string;
}

/**
 * Generates a standard PDF 1.4 binary document from an array of canvases.
 * Supports multi-page documents (one canvas per page) and transparency via /SMask.
 */
export const generatePdfFromCanvases = (
  pages: PdfPage[],
  metadata?: PdfMetadata,
): Uint8Array => {
  if (pages.length === 0) {
    throw new Error("Cannot generate PDF from empty page list.");
  }

  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();

  const writeString = (str: string) => {
    chunks.push(encoder.encode(str));
  };

  // Header
  writeString("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  const objectOffsets: number[] = [0]; // Index 0 is unused (object 0)
  let currentOffset = chunks.reduce((acc, c) => acc + c.length, 0);

  const startObject = (id: number) => {
    objectOffsets[id] = currentOffset;
    const header = `${id} 0 obj\n`;
    const bytes = encoder.encode(header);
    chunks.push(bytes);
    currentOffset += bytes.length;
  };

  const endObject = () => {
    const footer = "endobj\n";
    const bytes = encoder.encode(footer);
    chunks.push(bytes);
    currentOffset += bytes.length;
  };

  const writeRawStreamObject = (
    id: number,
    dict: Record<string, string | number>,
    streamData: Uint8Array,
  ) => {
    startObject(id);
    let dictStr = "<<\n";
    for (const [k, v] of Object.entries(dict)) {
      dictStr += `  /${k} ${v}\n`;
    }
    dictStr += `  /Length ${streamData.length}\n>>\nstream\n`;
    const dictBytes = encoder.encode(dictStr);
    chunks.push(dictBytes);
    currentOffset += dictBytes.length;

    chunks.push(streamData);
    currentOffset += streamData.length;

    const streamEnd = "\nendstream\n";
    const endBytes = encoder.encode(streamEnd);
    chunks.push(endBytes);
    currentOffset += endBytes.length;

    endObject();
  };

  // Assign object IDs dynamically
  let nextObjId = 1;
  const catalogId = nextObjId++;
  const pagesRootId = nextObjId++;

  interface PagePlan {
    pageObjId: number;
    contentObjId: number;
    imageObjId: number;
    smaskObjId: number | null;
    width: number;
    height: number;
    rgbBytes: Uint8Array;
    alphaBytes: Uint8Array | null;
    pixelWidth: number;
    pixelHeight: number;
  }

  const pagePlans: PagePlan[] = [];

  for (const page of pages) {
    const pageObjId = nextObjId++;
    const contentObjId = nextObjId++;
    const imageObjId = nextObjId++;

    const canvas = page.canvas;
    const pixelWidth = canvas.width;
    const pixelHeight = canvas.height;
    const pageWidth = page.width ?? pixelWidth;
    const pageHeight = page.height ?? pixelHeight;

    const ctx = canvas.getContext("2d");
    let rgb = new Uint8Array(pixelWidth * pixelHeight * 3);
    let alpha: Uint8Array | null = null;
    let smaskObjId: number | null = null;

    if (ctx) {
      try {
        const imgData = ctx.getImageData(0, 0, pixelWidth, pixelHeight);
        const data = imgData.data;
        const alphaBuf = new Uint8Array(pixelWidth * pixelHeight);
        let hasAlpha = false;

        for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
          rgb[j] = data[i];
          rgb[j + 1] = data[i + 1];
          rgb[j + 2] = data[i + 2];
          const a = data[i + 3];
          alphaBuf[i / 4] = a;
          if (a < 255) {
            hasAlpha = true;
          }
        }

        if (hasAlpha) {
          alpha = alphaBuf;
          smaskObjId = nextObjId++;
        }
      } catch {
        // Fallback for mocked canvas contexts without getImageData
        rgb = new Uint8Array(pixelWidth * pixelHeight * 3);
      }
    }

    pagePlans.push({
      pageObjId,
      contentObjId,
      imageObjId,
      smaskObjId,
      width: pageWidth,
      height: pageHeight,
      rgbBytes: rgb,
      alphaBytes: alpha,
      pixelWidth,
      pixelHeight,
    });
  }

  // 1. Catalog Object
  startObject(catalogId);
  writeString(`<< /Type /Catalog /Pages ${pagesRootId} 0 R >>\n`);
  endObject();

  // 2. Pages Root Object
  const kidsStr = pagePlans.map((p) => `${p.pageObjId} 0 R`).join(" ");
  startObject(pagesRootId);
  writeString(
    `<< /Type /Pages /Kids [ ${kidsStr} ] /Count ${pagePlans.length} >>\n`,
  );
  endObject();

  // 3. For each page, output Page Object, Content Object, Image Object (and optional SMask)
  for (const plan of pagePlans) {
    // Page Object
    startObject(plan.pageObjId);
    const resourcesStr = `<< /XObject << /Im1 ${plan.imageObjId} 0 R >> /ProcSet [/PDF /ImageC] >>`;
    writeString(
      `<<\n` +
        `  /Type /Page\n` +
        `  /Parent ${pagesRootId} 0 R\n` +
        `  /MediaBox [ 0 0 ${plan.width} ${plan.height} ]\n` +
        `  /Resources ${resourcesStr}\n` +
        `  /Contents ${plan.contentObjId} 0 R\n` +
        `>>\n`,
    );
    endObject();

    // Content Stream Object
    // Maps the image to fill the page exactly: [w 0 0 h 0 0 cm /Im1 Do]
    const contentStream = encoder.encode(
      `q\n${plan.width} 0 0 ${plan.height} 0 0 cm\n/Im1 Do\nQ\n`,
    );
    writeRawStreamObject(plan.contentObjId, {}, contentStream);

    // Compress RGB bytes using deflate
    let compressedRgb: Uint8Array;
    try {
      compressedRgb = deflate(plan.rgbBytes);
    } catch {
      compressedRgb = plan.rgbBytes;
    }

    const imageDict: Record<string, string | number> = {
      Type: "/XObject",
      Subtype: "/Image",
      Width: plan.pixelWidth,
      Height: plan.pixelHeight,
      ColorSpace: "/DeviceRGB",
      BitsPerComponent: 8,
      Filter: "/FlateDecode",
    };

    if (plan.smaskObjId !== null) {
      imageDict.SMask = `${plan.smaskObjId} 0 R`;
    }

    writeRawStreamObject(plan.imageObjId, imageDict, compressedRgb);

    // Optional SMask (alpha channel) Object
    if (plan.smaskObjId !== null && plan.alphaBytes !== null) {
      let compressedAlpha: Uint8Array;
      try {
        compressedAlpha = deflate(plan.alphaBytes);
      } catch {
        compressedAlpha = plan.alphaBytes;
      }

      const smaskDict: Record<string, string | number> = {
        Type: "/XObject",
        Subtype: "/Image",
        Width: plan.pixelWidth,
        Height: plan.pixelHeight,
        ColorSpace: "/DeviceGray",
        BitsPerComponent: 8,
        Filter: "/FlateDecode",
      };

      writeRawStreamObject(plan.smaskObjId, smaskDict, compressedAlpha);
    }
  }

  // Info dictionary (optional metadata)
  let infoId: number | null = null;
  if (metadata?.title || metadata?.creator) {
    infoId = nextObjId++;
    startObject(infoId);
    let infoStr = "<<\n";
    if (metadata.title) {
      infoStr += `  /Title (${metadata.title.replace(/[()\\]/g, "\\$&")})\n`;
    }
    if (metadata.creator) {
      infoStr += `  /Creator (${metadata.creator.replace(
        /[()\\]/g,
        "\\$&",
      )})\n`;
    }
    infoStr += `  /Producer (Firo Whiteboard)\n>>\n`;
    writeString(infoStr);
    endObject();
  }

  // Cross-reference table (xref)
  const startXref = currentOffset;
  const totalObjects = nextObjId;
  let xrefStr = `xref\n0 ${totalObjects}\n0000000000 65535 f \n`;

  for (let i = 1; i < totalObjects; i++) {
    const offset = objectOffsets[i] ?? 0;
    xrefStr += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }

  xrefStr += `trailer\n<<\n  /Size ${totalObjects}\n  /Root ${catalogId} 0 R\n`;
  if (infoId !== null) {
    xrefStr += `  /Info ${infoId} 0 R\n`;
  }
  xrefStr += `>>\nstartxref\n${startXref}\n%%EOF\n`;

  writeString(xrefStr);

  // Combine chunks into single Uint8Array
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }

  return result;
};
