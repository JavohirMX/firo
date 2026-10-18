import { describe, expect, it } from "vitest";
import { generatePdfFromCanvases, type PdfPage } from "@firo/utils/pdf";

const createMockCanvas = (width = 200, height = 100): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, width, height);
  }
  return canvas;
};

describe("PDF Generator", () => {
  it("produces a valid PDF 1.4 document for a single page", () => {
    const canvas = createMockCanvas(300, 200);
    const pages: PdfPage[] = [{ canvas, title: "Test Page" }];
    const bytes = generatePdfFromCanvases(pages, {
      title: "Board Export",
      creator: "Firo Tests",
    });

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(100);

    const pdfString = new TextDecoder("latin1").decode(bytes);

    // PDF 1.4 Header
    expect(pdfString).toContain("%PDF-1.4");

    // Standard structural objects
    expect(pdfString).toContain("/Type /Catalog");
    expect(pdfString).toContain("/Type /Pages");
    expect(pdfString).toContain("/Type /Page");
    expect(pdfString).toContain("/Type /XObject");
    expect(pdfString).toContain("/Subtype /Image");

    // Dimensions in points (72 DPI)
    expect(pdfString).toContain("/MediaBox [ 0 0 300 200 ]");

    // Cross-reference table & trailer
    expect(pdfString).toContain("xref");
    expect(pdfString).toContain("trailer");
    expect(pdfString).toContain("%%EOF");
  });

  it("produces a multi-page presentation deck from multiple frames", () => {
    const canvas1 = createMockCanvas(800, 600);
    const canvas2 = createMockCanvas(1920, 1080);
    const pages: PdfPage[] = [
      { canvas: canvas1, title: "Slide 1: Intro", width: 800, height: 600 },
      {
        canvas: canvas2,
        title: "Slide 2: Architecture",
        width: 1920,
        height: 1080,
      },
    ];

    const bytes = generatePdfFromCanvases(pages, {
      title: "Presentation Deck",
      creator: "Firo",
    });

    const pdfString = new TextDecoder("latin1").decode(bytes);

    // Count is 2
    expect(pdfString).toContain("/Count 2");

    // Distinct MediaBoxes
    expect(pdfString).toContain("/MediaBox [ 0 0 800 600 ]");
    expect(pdfString).toContain("/MediaBox [ 0 0 1920 1080 ]");
  });

  it("throws when pages array is empty", () => {
    expect(() => generatePdfFromCanvases([], { title: "Empty" })).toThrow(
      "Cannot generate PDF from empty page list.",
    );
  });
});
