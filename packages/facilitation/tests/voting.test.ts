import * as Y from "yjs";
import { FiroDoc } from "@firo/doc";
import type { FiroRecord } from "@firo/schema";
import { describe, expect, it } from "vitest";

import {
  findVote,
  leaders,
  placeVote,
  removeVote,
  tally,
  voteCollection,
  voteFromRecord,
  voteToRecord,
  votesFromRecords,
  VOTE_COLLECTION_ID,
  type Vote,
} from "../src/voting.js";

const vote = (over: Partial<Vote> = {}): Vote => ({
  recordId: "r1",
  elementId: "note-a",
  voterId: "ada",
  placedAt: 1000,
  ...over,
});

const stored = (votes: readonly Vote[]): FiroRecord[] =>
  votes.map((v) => ({
      id: v.recordId,
      collectionId: VOTE_COLLECTION_ID,
      values: {
        target: { type: "text", value: v.elementId },
        voter: { type: "text", value: v.voterId },
        placedAt: { type: "number", value: v.placedAt },
      },
      order: "a0",
      archived: false,
      created: 0,
      updated: 0,
    }) as unknown as FiroRecord);

describe("dot voting", () => {
  describe("stored as records, not element fields", () => {
    it("survives a real save/load round trip through the document", () => {
      // The reason votes are records at all. If they were element `customData`
      // they would still round-trip, but so would every vote from every session
      // the board had ever run -- and there would be no way to remove one.
      const doc = new FiroDoc(new Y.Doc());

      doc.commit([
        { kind: "createCollection", collection: voteCollection("board-1", "a0") },
        {
          kind: "createRecord",
          record: voteToRecord(
            { elementId: "note-a", voterId: "ada", placedAt: 1000 },
            "rec-1",
            "a0",
          ),
        },
      ]);

      const reloaded = new FiroDoc(new Y.Doc());
      reloaded.load(doc.read() as never);

      const votes = votesFromRecords(reloaded.read().records);
      expect(votes).toHaveLength(1);
      expect(votes[0].elementId).toBe("note-a");
      expect(votes[0].voterId).toBe("ada");
    });

    it("reads a vote back with the record id that withdrawing needs", () => {
      // `archiveRecords` filters on record ids. A vote that could report its
      // element but not its record would make "remove my vote" a silent no-op.
      const [read] = votesFromRecords(stored([vote({ recordId: "rec-7" })]));
      expect(read.recordId).toBe("rec-7");
    });

    it("ignores a record that is not a vote rather than throwing", () => {
      // Two shapes of "not a vote", because they fail in different places. A
      // record from another collection has values but not *these* values, and
      // finds nothing under the key. A record with no values at all -- a
      // half-written row, or a hand-edited file -- finds `undefined` for the
      // whole map, and a bare property read throws on it.
      //
      // A record store holds whatever a person put in it, so one bad row must
      // not take down the tally for every vote on the board.
      const foreign = {
        id: "foreign",
        collectionId: "some-other-collection",
        values: { somethingElse: { type: "text", value: "x" } },
        order: "a0",
        archived: false,
        created: 0,
        updated: 0,
      } as unknown as FiroRecord;

      const valueless = {
        id: "valueless",
        collectionId: VOTE_COLLECTION_ID,
        values: undefined as unknown as FiroRecord["values"],
        order: "a0",
        archived: false,
        created: 0,
        updated: 0,
      } as unknown as FiroRecord;

      const votes = votesFromRecords([
        ...stored([vote()]),
        foreign,
        valueless,
      ]);
      expect(votes).toHaveLength(1);
      expect(votes[0].elementId).toBe("note-a");
    });

    it("skips an archived vote, so withdrawal actually withdraws", () => {
      const archived = {
        ...stored([vote({ recordId: "rec-9" })])[0],
        archived: true,
      };
      expect(votesFromRecords([archived])).toEqual([]);
    });
  });

  describe("one vote per person", () => {
    it("keeps anonymous votes distinct, so one can be withdrawn", () => {
      // The trap: treating "no voter" as one shared identity would make two
      // anonymous participants the same person, and the second withdrawal would
      // remove the first person's dot.
      const votes = [
        vote({ recordId: "r1", voterId: "" }),
        vote({ recordId: "r2", voterId: "" }),
      ];
      expect(findVote(votes, "note-a", "")).toBe(votes[0]);
      expect(removeVote(votes, "note-a", "")).toEqual([
        { kind: "archiveRecords", ids: ["r1"] },
      ]);
    });

    it("moves a voter's dot rather than adding a second", () => {
      const votes = [vote({ recordId: "r1", elementId: "note-a", voterId: "ada" })];
      const mutations = placeVote(
        votes,
        { elementId: "note-b", voterId: "ada", placedAt: 2000 },
        { record: "r2", order: "a1", board: "board-1" },
        true,
      );

      const archived = mutations.filter((m) => m.kind === "archiveRecords");
      expect(archived).toEqual([{ kind: "archiveRecords", ids: ["r1"] }]);
    });

    it("does not archive the record it is about to write", () => {
      // Re-voting the same element with the same record id would otherwise
      // archive the record it just created, leaving no vote at all.
      const votes = [vote({ recordId: "r1", voterId: "ada" })];
      const mutations = placeVote(
        votes,
        { elementId: "note-a", voterId: "ada", placedAt: 3000 },
        { record: "r1", order: "a0", board: "board-1" },
        true,
      );
      expect(mutations.some((m) => m.kind === "archiveRecords")).toBe(false);
    });

    it("creates the collection before the record that references it", () => {
      const mutations = placeVote(
        [],
        { elementId: "note-a", voterId: "ada", placedAt: 0 },
        { record: "r1", order: "a0", board: "board-1" },
        false,
      );

      expect(mutations[0].kind).toBe("createCollection");
      expect(mutations.some((m) => m.kind === "createRecord")).toBe(true);
    });

    it("skips the collection when one already exists", () => {
      const mutations = placeVote(
        [],
        { elementId: "note-a", voterId: "ada", placedAt: 0 },
        { record: "r1", order: "a0", board: "board-1" },
        true,
      );
      expect(mutations.some((m) => m.kind === "createCollection")).toBe(false);
    });

    it("returns nothing when withdrawing a vote that was never placed", () => {
      expect(removeVote([], "note-a", "ada")).toEqual([]);
    });
  });

  describe("tallying", () => {
    it("counts per element", () => {
      const votes = [
        vote({ recordId: "r1", elementId: "note-a", voterId: "ada" }),
        vote({ recordId: "r2", elementId: "note-a", voterId: "bob" }),
        vote({ recordId: "r3", elementId: "note-b", voterId: "cy" }),
      ];
      const counts = tally(votes);

      expect(counts.get("note-a")).toBe(2);
      expect(counts.get("note-b")).toBe(1);
      expect(counts.get("note-c")).toBeUndefined();
    });

    it("is not fooled by an element id that collides with an Object prototype key", () => {
      // Element ids are arbitrary strings and votes can arrive from a file.
      // A plain-object tally would return nonsense for `__proto__`.
      const counts = tally([
        vote({ recordId: "r1", elementId: "__proto__", voterId: "ada" }),
        vote({ recordId: "r2", elementId: "__proto__", voterId: "bob" }),
      ]);
      expect(counts.get("__proto__")).toBe(2);
    });

    it("ranks the leaders, best first", () => {
      const votes = [
        vote({ recordId: "r1", elementId: "note-a", voterId: "1" }),
        vote({ recordId: "r2", elementId: "note-a", voterId: "2" }),
        vote({ recordId: "r3", elementId: "note-b", voterId: "3" }),
      ];
      expect(leaders(votes, 2)).toEqual(["note-a", "note-b"]);
    });

    it("breaks ties deterministically", () => {
      // An unstable tie would make "the top three" flicker between two level
      // elements, which on a projector looks like a bug in the tool.
      const votes = [
        vote({ recordId: "r1", elementId: "note-b", voterId: "1" }),
        vote({ recordId: "r2", elementId: "note-a", voterId: "2" }),
      ];
      expect(leaders(votes, 2)).toEqual(["note-a", "note-b"]);
      expect(leaders([...votes].reverse(), 2)).toEqual(["note-a", "note-b"]);
    });

    it("ranks fewer elements than asked rather than padding", () => {
      expect(leaders([vote()], 3)).toEqual(["note-a"]);
      expect(leaders([], 3)).toEqual([]);
    });
  });
});

