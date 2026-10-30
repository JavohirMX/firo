import React from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";

import { Popover } from "./Popover";

const mockPopoverDimensions = (width: number, height: number) => {
  const getBoundingClientRect = vi
    .spyOn(HTMLDivElement.prototype, "getBoundingClientRect")
    .mockReturnValue({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

  return () => {
    getBoundingClientRect.mockRestore();
  };
};

describe("Popover", () => {
  it("shifts overflowing content within its positioning container", () => {
    const restoreDimensions = mockPopoverDimensions(100, 80);

    try {
      const { container } = render(
        <Popover
          left={180}
          top={180}
          fitInViewport={true}
          viewportWidth={200}
          viewportHeight={200}
        />,
      );
      const popover = container.querySelector<HTMLDivElement>(".popover")!;

      expect(popover.style.left).toBe("90px");
      expect(popover.style.top).toBe("110px");
    } finally {
      restoreDimensions();
    }
  });

  it("resizes oversized content within the container gap", () => {
    const restoreDimensions = mockPopoverDimensions(250, 250);

    try {
      const { container } = render(
        <Popover
          left={180}
          top={180}
          fitInViewport={true}
          viewportWidth={200}
          viewportHeight={200}
        />,
      );
      const popover = container.querySelector<HTMLDivElement>(".popover")!;

      expect(popover.style.width).toBe("180px");
      expect(popover.style.height).toBe("180px");
      expect(popover.style.left).toBe("10px");
      expect(popover.style.top).toBe("10px");
      expect(popover.style.overflowX).toBe("scroll");
      expect(popover.style.overflowY).toBe("scroll");
    } finally {
      restoreDimensions();
    }
  });

  it("flips above the anchor when it overflows below and fits above", () => {
    const restoreDimensions = mockPopoverDimensions(100, 80);

    try {
      const { container } = render(
        <Popover
          left={60}
          top={180}
          fitInViewport={true}
          flipAbove={true}
          viewportWidth={200}
          viewportHeight={200}
        />,
      );
      const popover = container.querySelector<HTMLDivElement>(".popover")!;

      // 180 + 80 overflows the 190 limit; 180 - 80 = 100 fits above.
      expect(popover.style.top).toBe("100px");
      expect(popover.style.left).toBe("60px");
    } finally {
      restoreDimensions();
    }
  });

  it("stays below the anchor when flipAbove is not set", () => {
    const restoreDimensions = mockPopoverDimensions(100, 80);

    try {
      const { container } = render(
        <Popover
          left={60}
          top={180}
          fitInViewport={true}
          viewportWidth={200}
          viewportHeight={200}
        />,
      );
      const popover = container.querySelector<HTMLDivElement>(".popover")!;

      // Clamped into the viewport instead: 200 - 10 - 80.
      expect(popover.style.top).toBe("110px");
    } finally {
      restoreDimensions();
    }
  });

  it("flips when it fits above exactly at the container gap", () => {
    const restoreDimensions = mockPopoverDimensions(100, 170);

    try {
      const { container } = render(
        <Popover
          left={60}
          top={180}
          fitInViewport={true}
          flipAbove={true}
          viewportWidth={200}
          viewportHeight={200}
        />,
      );
      const popover = container.querySelector<HTMLDivElement>(".popover")!;

      // 180 - 170 = 10 is exactly the gap: still fits, still flips.
      expect(popover.style.top).toBe("10px");
    } finally {
      restoreDimensions();
    }
  });

  it("falls back to clamping when it fits neither above nor below", () => {
    const restoreDimensions = mockPopoverDimensions(100, 150);

    try {
      const { container } = render(
        <Popover
          left={60}
          top={100}
          fitInViewport={true}
          flipAbove={true}
          viewportWidth={200}
          viewportHeight={200}
        />,
      );
      const popover = container.querySelector<HTMLDivElement>(".popover")!;

      // 100 + 150 overflows below; 100 - 150 < 10 does not fit above:
      // clamp to 200 - 10 - 150.
      expect(popover.style.top).toBe("40px");
    } finally {
      restoreDimensions();
    }
  });
});
