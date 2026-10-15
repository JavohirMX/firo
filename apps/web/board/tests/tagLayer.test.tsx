import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import * as Y from "yjs";

import { FiroDoc } from "@firo/doc";
import { asFractionalIndex } from "@firo/schema";

import type { FiroElement } from "@firo/schema";
import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

import { TagLayer } from "../../components/TagLayer";
import * as boardModule from "../board";

const note = (id: string, tags?: readonly string[]): FiroElement =>
  ({
    id,
    type: "stickynote",
    text: `note ${id}`,
    x: 100,
    y: 50,
    width: 200,
    height: 120,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "#fff9b1",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roundness: null,
    roughness: 1,
    opacity: 100,
    version: 1,
    versionNonce: 1,
    index: asFractionalIndex("a0"),
    created: 1,
    updated: 1,
    groupIds: [],
    frameId: null,
    containerId: null,
    bindings: [],
    link: null,
    locked: false,
    isDeleted: false,
    isContainer: false,
    fontSize: 20,
    fontFamily: 6,
    textAlign: "left",
    verticalAlign: "top",
    tags,
  } as unknown as FiroElement);

const fakeEditor = (): ExcalidrawImperativeAPI =>
  ({
    getAppState: () => ({
      scrollX: 0,
      scrollY: 0,
      zoom: { value: 1 },
    }),
    onScrollChange: () => () => {},
  } as unknown as ExcalidrawImperativeAPI);

describe("TagLayer", () => {
  it("renders nothing when no elements have tags", () => {
    const doc = new FiroDoc(new Y.Doc());
    vi.spyOn(boardModule, "boardDoc").mockReturnValue(doc);
    doc.commit([{ kind: "createElement", element: note("el-1") }]);

    const { queryByTestId } = render(
      <TagLayer excalidrawAPI={fakeEditor()} onSelectTag={() => {}} />,
    );

    expect(queryByTestId("firo-tags-layer")).toBeNull();
  });

  it("renders tag badges positioned at element bounds and triggers onSelectTag", () => {
    const doc = new FiroDoc(new Y.Doc());
    vi.spyOn(boardModule, "boardDoc").mockReturnValue(doc);
    doc.commit([
      { kind: "createElement", element: note("el-1", ["planning", "urgent"]) },
    ]);

    const onSelectTag = vi.fn();
    const { getByTestId } = render(
      <TagLayer excalidrawAPI={fakeEditor()} onSelectTag={onSelectTag} />,
    );

    const container = getByTestId("element-tags-el-1");
    expect(container).toBeDefined();
    // Position: left = (100 + 0) * 1 = 100px, top = (50 + 120 + 0) * 1 = 170px
    expect(container.getAttribute("style")).toContain("left: 100px");
    expect(container.getAttribute("style")).toContain("top: 170px");

    const badge1 = getByTestId("tag-badge-el-1-planning");
    const badge2 = getByTestId("tag-badge-el-1-urgent");
    expect(badge1.textContent).toBe("#planning");
    expect(badge2.textContent).toBe("#urgent");

    act(() => {
      fireEvent.click(badge1);
    });
    expect(onSelectTag).toHaveBeenCalledWith("planning");
  });
});
