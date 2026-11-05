/*
 * The board bar's title (Miro parity row 1). Without a rename handler the
 * title stays the home control, exactly as before; with one, home moves to
 * a dedicated boards button and the title becomes an inline rename field.
 */
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import { BoardMenu } from "../src";

describe("BoardMenu thumbnail", () => {
  it("renders the board's preview between home and the title", () => {
    render(
      <BoardMenu
        boardName="Roadmap"
        onOpenHome={vi.fn()}
        onRenameBoard={vi.fn()}
        thumbnail="data:image/png;base64,thumb"
      />,
    );
    const img = screen.getByTestId("board-menu-thumbnail");
    expect(img.getAttribute("src")).toBe("data:image/png;base64,thumb");
    expect(img.getAttribute("alt")).toBe("");
    // Order: hamburger, boards button, thumbnail, then the title.
    const bar = img.parentElement!;
    const home = screen.getByTestId("board-menu-home");
    const title = screen.getByTestId("board-menu-rename");
    expect(
      home.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      img.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(bar).toBeTruthy();
  });

  it("keeps the bar compact while no capture exists", () => {
    render(
      <BoardMenu
        boardName="Roadmap"
        onOpenHome={vi.fn()}
        onRenameBoard={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("board-menu-thumbnail")).toBeNull();
  });
});

describe("BoardMenu title", () => {
  it("keeps the title as the home control without onRenameBoard", () => {
    const onOpenHome = vi.fn();
    render(<BoardMenu boardName="Roadmap" onOpenHome={onOpenHome} />);
    expect(screen.queryByTestId("board-menu-home")).toBeNull();
    fireEvent.click(screen.getByLabelText("All boards — Roadmap"));
    expect(onOpenHome).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("board-menu-rename-input")).toBeNull();
  });

  it("moves home to a boards button once the title renames", () => {
    const onOpenHome = vi.fn();
    render(
      <BoardMenu
        boardName="Roadmap"
        onOpenHome={onOpenHome}
        onRenameBoard={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("board-menu-home"));
    expect(onOpenHome).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Rename board — Roadmap")).toBeDefined();
  });

  it("commits a trimmed new name on Enter", () => {
    const onRenameBoard = vi.fn();
    render(<BoardMenu boardName="Roadmap" onRenameBoard={onRenameBoard} />);
    fireEvent.click(screen.getByTestId("board-menu-rename"));
    const input = screen.getByTestId("board-menu-rename-input");
    fireEvent.change(input, { target: { value: "  Launch plan  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRenameBoard).toHaveBeenCalledWith("Launch plan");
    expect(screen.queryByTestId("board-menu-rename-input")).toBeNull();
  });

  it("commits on blur and cancels on Escape", () => {
    const onRenameBoard = vi.fn();
    render(<BoardMenu boardName="Roadmap" onRenameBoard={onRenameBoard} />);
    // blur commits
    fireEvent.click(screen.getByTestId("board-menu-rename"));
    let input = screen.getByTestId("board-menu-rename-input");
    fireEvent.change(input, { target: { value: "Retro" } });
    fireEvent.blur(input);
    expect(onRenameBoard).toHaveBeenCalledWith("Retro");
    // Escape cancels
    fireEvent.click(screen.getByTestId("board-menu-rename"));
    input = screen.getByTestId("board-menu-rename-input");
    fireEvent.change(input, { target: { value: "Discarded" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRenameBoard).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("board-menu-rename").textContent).toBe("Roadmap");
  });

  it("ignores empty and unchanged names", () => {
    const onRenameBoard = vi.fn();
    render(<BoardMenu boardName="Roadmap" onRenameBoard={onRenameBoard} />);
    fireEvent.click(screen.getByTestId("board-menu-rename"));
    let input = screen.getByTestId("board-menu-rename-input");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRenameBoard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("board-menu-rename"));
    input = screen.getByTestId("board-menu-rename-input");
    fireEvent.change(input, { target: { value: "Roadmap" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRenameBoard).not.toHaveBeenCalled();
  });
});
