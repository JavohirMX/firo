import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExportModal } from "../src/components/ExportModal";

const renderModal = (onExportImage = vi.fn()) => {
  const onClose = vi.fn();
  render(
    <ExportModal
      isOpen
      onClose={onClose}
      boardName="Test board"
      onExportImage={onExportImage}
    />,
  );
  return { onExportImage, onClose };
};

describe("ExportModal image tab", () => {
  it("keeps PNG the default format with copy and embed options", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Download PNG" })).toBeTruthy();
    expect(screen.getByText("Canvas background")).toBeTruthy();
    expect(
      screen.getByText("Embed board data (can reopen in Firo)"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Copy to Clipboard" }),
    ).toBeTruthy();
  });

  it("offers JPG as a raster format with resolution scale", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "JPG (Raster)" }));
    expect(screen.getByRole("button", { name: "Download JPG" })).toBeTruthy();
    // raster formats expose the resolution scale
    expect(screen.getByText("Resolution Scale")).toBeTruthy();
  });

  it("forces the canvas background and hides copy/embed for JPG", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "JPG (Raster)" }));
    const background = screen.getByRole("checkbox", {
      name: "Canvas background",
    }) as HTMLInputElement;
    expect(background.checked).toBe(true);
    expect(background.disabled).toBe(true);
    expect(
      screen.queryByText("Embed board data (can reopen in Firo)"),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Copy to Clipboard" }),
    ).toBeNull();
  });

  it("downloads JPG with the background forced on", () => {
    const { onExportImage, onClose } = renderModal();
    // uncheck background first to prove the JPG path overrides it
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Canvas background" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "JPG (Raster)" }));
    fireEvent.click(screen.getByRole("button", { name: "Download JPG" }));
    expect(onExportImage).toHaveBeenCalledTimes(1);
    expect(onExportImage).toHaveBeenCalledWith(
      expect.objectContaining({ format: "jpg", background: true }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("SVG keeps working without the resolution scale section", () => {
    const { onExportImage } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "SVG (Vector)" }));
    expect(screen.queryByText("Resolution Scale")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Download SVG" }));
    expect(onExportImage).toHaveBeenCalledWith(
      expect.objectContaining({ format: "svg" }),
    );
  });
});
