/**
 * Converts Firo board elements into Miro board items and executable Web SDK scripts
 * for complete two-way compatibility.
 */

import type { MiroItem } from "./types";

const FIRO_TO_MIRO_COLOR: Readonly<Record<string, string>> = {
  "#fff9b8": "light_yellow",
  "#fbf34c": "yellow",
  "#ffc470": "orange",
  "#d5f692": "light_green",
  "#8fd14f": "green",
  "#0ca789": "dark_green",
  "#a6e3e9": "cyan",
  "#70b4ff": "blue",
  "#2d9cdb": "dark_blue",
  "#c5a3ff": "violet",
  "#ea7ae5": "magenta",
  "#ffb2d8": "pink",
  "#f2647c": "red",
  "#d0d0d0": "gray",
  "#333333": "black",
  "#ffffff": "white",
};

export const mapFiroColorToMiro = (color: string | undefined): string => {
  if (!color) {
    return "yellow";
  }
  const lower = color.toLowerCase();
  return FIRO_TO_MIRO_COLOR[lower] ?? "yellow";
};

export const convertFiroToMiroItems = (
  elements: readonly Record<string, unknown>[],
): MiroItem[] => {
  const miroItems: MiroItem[] = [];

  for (const el of elements) {
    if (el.isDeleted) {
      continue;
    }

    const type = String(el.type ?? "");
    const id = String(el.id ?? "");
    const width = Number(el.width ?? 150);
    const height = Number(el.height ?? 150);
    const x = Number(el.x ?? 0) + width / 2;
    const y = Number(el.y ?? 0) + height / 2;
    const parentId = el.frameId
      ? String(el.frameId)
      : el.containerId
      ? String(el.containerId)
      : null;

    switch (type) {
      case "stickynote": {
        miroItems.push({
          id,
          type: "sticky_note",
          data: {
            content: String(el.text ?? ""),
            shape: "square",
          },
          style: {
            fillColor: mapFiroColorToMiro(String(el.backgroundColor ?? "")),
            textAlign: (el.textAlign as "left" | "center" | "right") ?? "left",
          },
          position: { x, y, origin: "center" },
          geometry: { width, height },
          parentId,
        });
        break;
      }

      case "rectangle":
      case "ellipse":
      case "diamond": {
        let shape = "rectangle";
        if (type === "ellipse") {
          shape = "circle";
        } else if (type === "diamond") {
          shape = "rhombus";
        } else if (el.roundness) {
          shape = "round_rectangle";
        }

        miroItems.push({
          id,
          type: "shape",
          data: {
            shape,
            content: "",
          },
          style: {
            fillColor: mapFiroColorToMiro(String(el.backgroundColor ?? "")),
            borderColor: String(el.strokeColor ?? "#1e1e1e"),
            borderWidth: Number(el.strokeWidth ?? 1),
          },
          position: { x, y, origin: "center" },
          geometry: { width, height },
          parentId,
        });
        break;
      }

      case "text": {
        miroItems.push({
          id,
          type: "text",
          data: {
            content: String(el.text ?? ""),
          },
          style: {
            color: String(el.strokeColor ?? "#1e1e1e"),
            fontSize: Number(el.fontSize ?? 20),
            textAlign: (el.textAlign as "left" | "center" | "right") ?? "left",
          },
          position: { x, y, origin: "center" },
          geometry: { width, height },
          parentId,
        });
        break;
      }

      case "frame": {
        miroItems.push({
          id,
          type: "frame",
          data: {
            title: String(el.name ?? "Frame"),
          },
          position: { x, y, origin: "center" },
          geometry: { width, height },
        });
        break;
      }

      case "arrow":
      case "line": {
        const bindings = (el.bindings as { elementId: string }[]) ?? [];
        const start = bindings[0]
          ? { item: String(bindings[0].elementId) }
          : undefined;
        const end = bindings[1]
          ? { item: String(bindings[1].elementId) }
          : undefined;

        miroItems.push({
          id,
          type: "connector",
          start,
          end,
          style: {
            strokeColor: String(el.strokeColor ?? "#1e1e1e"),
            strokeWidth: Number(el.strokeWidth ?? 1),
          },
          position: { x, y, origin: "center" },
          geometry: { width, height },
        });
        break;
      }
    }
  }

  return miroItems;
};

/**
 * Generates an executable JavaScript snippet that recreates the board in Miro
 * using Miro Web SDK (`miro.board.create...`).
 */
export const generateMiroCreationScript = (
  elements: readonly Record<string, unknown>[],
): string => {
  const items = convertFiroToMiroItems(elements);
  const itemsJson = JSON.stringify(items, null, 2);

  return `// === Firo to Miro Board Importer Script ===
// Open your Miro board in the browser, press F12 (DevTools Console), and run:
(async () => {
  const items = ${itemsJson};
  console.log("Importing " + items.length + " items into Miro...");
  
  const idMap = new Map();
  for (const item of items) {
    try {
      let created;
      if (item.type === "sticky_note") {
        created = await miro.board.createStickyNote({
          content: item.data?.content || "",
          x: item.position?.x,
          y: item.position?.y,
          width: item.geometry?.width,
          style: item.style,
        });
      } else if (item.type === "shape") {
        created = await miro.board.createShape({
          shape: item.data?.shape || "rectangle",
          content: item.data?.content || "",
          x: item.position?.x,
          y: item.position?.y,
          width: item.geometry?.width,
          height: item.geometry?.height,
          style: item.style,
        });
      } else if (item.type === "text") {
        created = await miro.board.createText({
          content: item.data?.content || "",
          x: item.position?.x,
          y: item.position?.y,
          width: item.geometry?.width,
          style: item.style,
        });
      } else if (item.type === "frame") {
        created = await miro.board.createFrame({
          title: item.data?.title || "Frame",
          x: item.position?.x,
          y: item.position?.y,
          width: item.geometry?.width,
          height: item.geometry?.height,
        });
      }
      if (created) {
        idMap.set(item.id, created.id);
      }
    } catch (err) {
      console.warn("Failed to create " + item.type + ":", err);
    }
  }

  // Connectors in second pass
  for (const item of items) {
    if (item.type === "connector" && item.start?.item && item.end?.item) {
      const startId = idMap.get(item.start.item);
      const endId = idMap.get(item.end.item);
      if (startId && endId) {
        try {
          await miro.board.createConnector({
            start: { item: startId },
            end: { item: endId },
            style: item.style,
          });
        } catch (err) {
          console.warn("Failed connector:", err);
        }
      }
    }
  }

  console.log("Firo board imported to Miro successfully!");
})();`;
};
