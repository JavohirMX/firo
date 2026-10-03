import * as Y from "yjs";
import { describe, expect, it } from "vitest";

import { FiroDoc, readAllAssets, structure } from "@firo/doc";

import type { AssetReference } from "@firo/doc";

/*
 * Prototype keys in a document.
 *
 * A `Y.Map` holds any string, and a key of `__proto__` survives the round trip
 * through a Yjs update intact -- it is a peer or a file that put it there, not
 * a bug in the encoding. So the readers have to cope with it.
 *
 * The failure this prevents is quiet in both directions. An entry written with
 * `out["__proto__"] = value` on an object literal does not create an own
 * property; it assigns to the prototype. The field then disappears from
 * `Object.keys` and from anything that serialises the result, which is silent
 * data loss -- and a lookup for a key that is *absent* returns the injected
 * value instead of `undefined`, so a caller asking "does this board have X?"
 * gets an answer about something else entirely.
 *
 * Both are reachable as soon as documents come from a file, which is ADR-0018.
 */

const assetNode = (hash: string) =>
  new Y.Map<unknown>([
    ["hash", hash],
    ["mimeType", "image/png"],
    ["bytes", 10],
  ]);

describe("a document carrying a __proto__ key", () => {
  it("keeps the entry as an own property instead of losing it to the prototype", () => {
    const ydoc = new Y.Doc();
    const root = ydoc.getMap("assets");
    root.set("__proto__", assetNode("cafebabe"));
    root.set("file-1", assetNode("deadbeef"));

    const out = readAllAssets(structure(ydoc));

    // The whole point: two entries in, two out.
    expect(Object.keys(out).sort()).toEqual(["__proto__", "file-1"]);
    expect(Object.prototype.hasOwnProperty.call(out, "__proto__")).toBe(true);
  });

  it("returns undefined for a key that is genuinely absent", () => {
    // The other half. With a prototype in place, a missing lookup answers with
    // whatever the injected object holds -- so a caller cannot tell "absent"
    // from "present but different".
    const ydoc = new Y.Doc();
    const root = ydoc.getMap("assets");
    root.set("__proto__", assetNode("cafebabe"));

    const out = readAllAssets(structure(ydoc));

    expect(out["file-1"]).toBeUndefined();
    expect(out.hash).toBeUndefined();
    expect("hash" in out).toBe(false);
  });

  it("survives the trip through the document's own reader", () => {
    const doc = new FiroDoc(new Y.Doc());
    doc.commit([
      {
        kind: "setAsset",
        id: "__proto__",
        reference: {
          hash: "cafebabe",
          mimeType: "image/png",
          bytes: 10,
        } as AssetReference,
      },
      {
        kind: "setAsset",
        id: "file-1",
        reference: {
          hash: "deadbeef",
          mimeType: "image/png",
          bytes: 20,
        } as AssetReference,
      },
    ]);

    const assets = doc.readAssets();
    expect(Object.keys(assets).sort()).toEqual(["__proto__", "file-1"]);
    // Bracket notation on purpose. `assets.__proto__` reads as the prototype
    // accessor, and an autofix that rewrites this to dot notation makes the
    // assertion look like it is about the prototype when it is about an ordinary
    // own key that happens to be spelled `__proto__`.
    // eslint-disable-next-line dot-notation
    expect(assets["__proto__"].hash).toBe("cafebabe");
  });

  it("does not let a nested __proto__ key answer a lookup for another element", () => {
    // The same hazard one level down, and the reason `fromYMap` is fixed rather
    // than only `readAllAssets`: `fromYMap` builds every element, record and
    // nested map in the document, so a `__proto__` key inside one leaks its
    // fields onto every sibling lookup made through the same object.
    //
    // Written so that reverting `fromYMap` to an object literal makes this fail.
    // The earlier version of this test passed against the bug, because it only
    // ever asked about `doc.readAssets()` -- which `readAllAssets` builds itself,
    // so fixing that function alone left `fromYMap` unguarded and the test green.
    const ydoc = new Y.Doc();
    const elements = ydoc.getMap("elements");

    // Two elements. The second carries a nested map whose key is `__proto__`.
    // Both are read into the same shape, so if the nested object has a prototype
    // then a lookup on *either* element can be answered by the other's data --
    // which is the leak, and why one element is not enough to detect it.
    const clean = new Y.Map<unknown>();
    clean.set("id", "note-a");
    clean.set("type", "stickynote");
    elements.set("note-a", clean);

    const hostile = new Y.Map<unknown>();
    hostile.set("id", "note-b");
    hostile.set("type", "stickynote");
    const nested = new Y.Map<unknown>();
    nested.set("__proto__", "polluted");
    hostile.set("customData", nested);
    elements.set("note-b", hostile);

    const snapshot = new FiroDoc(ydoc).read();
    expect(snapshot.elements).toHaveLength(2);

    for (const el of snapshot.elements) {
      const asRecord = el as unknown as Record<string, unknown>;
      // The sibling's injected value must not be readable through this element.
      expect(asRecord.polluted).toBeUndefined();
      expect("polluted" in asRecord).toBe(false);
    }

    // And the nested map itself must be prototype-free, so a lookup on it for a
    // key it does not have answers `undefined` rather than reaching a prototype.
    //
    // This is the assertion that fails when `fromYMap` returns an object
    // literal: the nested object then has a prototype, `"polluted" in custom`
    // is true, and `custom.polluted` answers for a key that was never there.
    const withCustomData = snapshot.elements.find((el) => el.id === "note-b");
    const custom = (withCustomData as unknown as Record<string, unknown>)
      .customData as Record<string, unknown>;

    expect(custom).toBeDefined();
    expect(Object.getPrototypeOf(custom)).toBeNull();
    expect(Object.keys(custom)).toEqual(["__proto__"]);
    expect(custom.polluted).toBeUndefined();
    expect("polluted" in custom).toBe(false);
  });

  it("serialises to JSON without losing the entry", () => {
    // The consequence that matters for the file format: an entry the exporter
    // cannot see is bytes the manifest will not name, which is the silent-loss
    // failure AC-10 is about.
    const ydoc = new Y.Doc();
    ydoc.getMap("assets").set("__proto__", assetNode("cafebabe"));

    const out = readAllAssets(structure(ydoc));
    const round = JSON.parse(JSON.stringify(out)) as Record<string, unknown>;

    expect(Object.keys(round)).toEqual(["__proto__"]);
  });
});
