import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { useFocusTrap } from "../hooks/useFocusTrap";

const Dialog: React.FC<{ open: boolean }> = ({ open }) => {
  const ref = useFocusTrap<HTMLDivElement>(open);
  if (!open) {
    return null;
  }
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Test dialog">
      <button type="button">first</button>
      <button type="button">last</button>
    </div>
  );
};

/**
 * A dialog whose node appears on a *later* render, which is what a portalled
 * dialog does: `useCreatePortalContainer` returns null until a layout effect
 * has run. A `RefObject`-based trap silently does nothing here.
 */
const LateDialog: React.FC<{ mounted: boolean }> = ({ mounted }) => {
  const ref = useFocusTrap<HTMLDivElement>(true);
  if (!mounted) {
    return null;
  }
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Late dialog">
      <button type="button">inside</button>
    </div>
  );
};

describe("useFocusTrap", () => {
  it("moves focus inside on mount", () => {
    render(<Dialog open />);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "first" }),
    );
  });

  it("wraps Tab at the end and Shift+Tab at the start", () => {
    render(<Dialog open />);
    const first = screen.getByRole("button", { name: "first" });
    const last = screen.getByRole("button", { name: "last" });

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("restores focus to the opener on unmount", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(<Dialog open />);
    expect(document.activeElement).not.toBe(trigger);

    unmount();
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });

  it("traps once the node attaches on a later render", () => {
    const { rerender } = render(<LateDialog mounted={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(<LateDialog mounted />);

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "inside" }),
    );
  });

  it("takes focus itself when the dialog holds nothing focusable", () => {
    const Empty: React.FC = () => {
      const ref = useFocusTrap<HTMLDivElement>(true);
      return (
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label="Empty dialog"
        >
          <span>no controls here</span>
        </div>
      );
    };

    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount: close } = render(<Empty />);
    const dialog = screen.getByRole("dialog");

    expect(document.activeElement).toBe(dialog);
    expect(dialog.getAttribute("tabindex")).toBe("-1");

    // and Tab cannot walk focus out of it
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(dialog);

    close();
    expect(document.activeElement).toBe(trigger);
    expect(dialog.getAttribute("tabindex")).toBeNull();

    trigger.remove();
  });

  it("leaves focus alone while it is not active", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    render(<Dialog open={false} />);

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
