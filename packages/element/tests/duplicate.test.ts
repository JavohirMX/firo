import { deepCopyElement } from "../src/duplicate";

/*
 * `deepCopyElement` is the store's immutability seam: `createElementsSnapshot`
 * runs it over the whole scene on every change, so a value it cannot copy does
 * not damage one element — it takes the editor down.
 *
 * ## The case that was missing
 *
 * `@firo/doc` reads every nested document object back as `Object.create(null)`
 * (`fromYMap` in `packages/doc/src/structure.ts`), deliberately, so a key named
 * `__proto__` becomes an ordinary own key rather than replacing the prototype.
 * Those values ride onto elements projected for the editor, and the editor
 * expected `val.hasOwnProperty` to exist on them. It does not, and it is not
 * borrowed from anywhere — a prototype-less object has no methods at all.
 *
 * Measured: reloading a board holding a single rectangle threw
 * `val.hasOwnProperty is not a function` from `createElementsSnapshot`, and the
 * canvas stayed on "Loading scene..." forever because the throw happened before
 * the editor could lower its own loading flag.
 *
 * These tests build the values the document actually produces, and assert both
 * halves of the contract: the copy equals the original, and the copy is a normal
 * object again — which is what the rest of the editor assumes.
 */

/** A stand-in element. The real type is a union; the seam takes any object. */
type ElementRecord = Record<string, unknown>;

const deepCopyOf = (value: ElementRecord): ElementRecord =>
  deepCopyElement(value as never) as unknown as ElementRecord;

const nullProto = (value: ElementRecord): ElementRecord =>
  Object.assign(Object.create(null) as ElementRecord, value);

const protoOf = (value: unknown): unknown => Object.getPrototypeOf(value);

const owns = (value: unknown, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

describe("deepCopyElement", () => {
  it("copies an element whose nested value has no prototype", () => {
    const element: ElementRecord = {
      id: "rect1",
      type: "rectangle",
      // A rectangle's roundness is a nested object in the document, and so the
      // first field to reach this path on any real board.
      roundness: nullProto({ type: 3 }),
    };

    const copy = deepCopyOf(element);

    expect(copy).toEqual(element);
    expect(copy).not.toBe(element);
    expect(copy.roundness).not.toBe(element.roundness);
    // The copy is safe to hand back to code that uses methods on it.
    expect(protoOf(copy.roundness)).toBe(Object.prototype);
    expect(owns(copy.roundness, "type")).toBe(true);
  });

  it("copies a nested value with no prototype at any depth", () => {
    const element: ElementRecord = {
      id: "free1",
      type: "freedraw",
      // `strokeOptions` sits one level deeper than `roundness`, and `customData`
      // is the escape hatch every element carries.
      strokeOptions: nullProto({ variability: "variable", streamline: 0.4 }),
      customData: nullProto({ "firo.containerId": "section-1" }),
    };

    const copy = deepCopyOf(element);

    expect(copy).toEqual(element);
    expect(protoOf(copy.strokeOptions)).toBe(Object.prototype);
    expect(protoOf(copy.customData)).toBe(Object.prototype);
  });

  it("copies a prototype-less value held inside an array", () => {
    // Points are `[x, y]` pairs; a document pair arrives prototype-less too, and
    // the array branch recurses into it.
    const pair = nullProto({ 0: 0, 1: 0 });
    const element: ElementRecord = {
      id: "line1",
      type: "line",
      points: [pair, [200, 150]],
    };

    const copy = deepCopyOf(element);

    expect(copy.points).toEqual(element.points);
    const points = copy.points as unknown[];
    expect(protoOf(points[0])).toBe(Object.prototype);
  });

  it("still copies a normal element, prototype and all", () => {
    const element: ElementRecord = {
      id: "rect2",
      type: "rectangle",
      seed: 1,
      version: 2,
      roundness: { type: 3 },
    };

    const copy = deepCopyOf(element);

    expect(copy).toEqual(element);
    expect(copy).not.toBe(element);
    expect(copy.roundness).not.toBe(element.roundness);
  });

  it("leaves an element with an explicit null roundness alone", () => {
    // The common case for a note or an image: nothing nested, nothing to break.
    const element: ElementRecord = {
      id: "note1",
      type: "text",
      roundness: null,
    };

    const copy = deepCopyOf(element);

    expect(copy).toEqual(element);
    expect(copy.roundness).toBeNull();
  });
});
