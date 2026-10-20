import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { createFiroDoc, AWARENESS_KEY } from "@firo/doc";

import {
  CollabProvider,
  MESSAGE_SYNC,
  MESSAGE_AWARENESS,
  buildRelayWsUrl,
  resolveShareToken,
  type CollabStatus,
  type CollaboratorInfo,
} from "../collabProvider";

class MockWebSocket {
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  public readyState: number = MockWebSocket.CONNECTING;
  public binaryType: string = "arraybuffer";
  public url: string;

  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: unknown }) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: ((error: unknown) => void) | null = null;

  public sentMessages: Uint8Array[] = [];
  public peer: MockWebSocket | null = null;

  constructor(url: string) {
    this.url = url;
  }

  public open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  public send(data: unknown): void {
    let uint8: Uint8Array;
    if (data instanceof Uint8Array) {
      uint8 = data;
    } else if (data instanceof ArrayBuffer) {
      uint8 = new Uint8Array(data);
    } else {
      uint8 = new Uint8Array(data as any);
    }
    this.sentMessages.push(uint8);

    if (this.peer && this.peer.readyState === MockWebSocket.OPEN) {
      this.peer.onmessage?.({ data: uint8 });
    }
  }

  public close(): void {
    if (this.readyState === MockWebSocket.CLOSED) {
      return;
    }
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
    if (this.peer && this.peer.readyState !== MockWebSocket.CLOSED) {
      this.peer.close();
    }
  }

  public receive(data: Uint8Array): void {
    if (this.readyState === MockWebSocket.OPEN) {
      this.onmessage?.({ data });
    }
  }
}

describe("CollabProvider", () => {
  let doc: ReturnType<typeof createFiroDoc>;

  beforeEach(() => {
    doc = createFiroDoc();
  });

  describe("URL generation", () => {
    it("builds relay WS URL with boardId and shareToken", () => {
      const url1 = buildRelayWsUrl("board-123", null, "ws://localhost:8080/ws");
      expect(url1).toBe("ws://localhost:8080/ws?boardId=board-123");

      const url2 = buildRelayWsUrl(
        "board-456",
        "token-abc",
        "ws://localhost:8080/ws",
      );
      expect(url2).toBe(
        "ws://localhost:8080/ws?boardId=board-456&shareToken=token-abc",
      );
    });

    it("respects existing query parameters in base URL", () => {
      const url = buildRelayWsUrl(
        "board-789",
        "token-xyz",
        "wss://relay.example.com/ws?v=2",
      );
      expect(url).toBe(
        "wss://relay.example.com/ws?v=2&boardId=board-789&shareToken=token-xyz",
      );
    });
  });

  describe("Connection status transitions", () => {
    it("transitions connecting -> connected -> disconnected", () => {
      let createdWs: MockWebSocket | null = null;
      class CustomMockWS extends MockWebSocket {
        constructor(url: string) {
          super(url);
          createdWs = this;
        }
      }

      const statusHistory: CollabStatus[] = [];
      const provider = new CollabProvider({
        boardId: "board-status-test",
        doc,
        WebSocketPolyfill: CustomMockWS as unknown as typeof WebSocket,
        autoConnect: true,
      });

      provider.onStatusChange((s) => statusHistory.push(s));

      expect(provider.status).toBe("connecting");
      expect(createdWs).not.toBeNull();

      // Trigger socket open
      createdWs!.open();
      expect(provider.status).toBe("connected");
      expect(provider.isConnected).toBe(true);

      // Trigger socket close
      createdWs!.close();
      expect(provider.status).toBe("disconnected");
      expect(provider.isConnected).toBe(false);

      expect(statusHistory).toEqual([
        "connecting",
        "connected",
        "disconnected",
      ]);

      provider.destroy();
    });

    it("supports manual disconnect and reconnect", () => {
      let createdWs: MockWebSocket | null = null;
      class CustomMockWS extends MockWebSocket {
        constructor(url: string) {
          super(url);
          createdWs = this;
        }
      }

      const provider = new CollabProvider({
        boardId: "board-manual-test",
        doc,
        WebSocketPolyfill: CustomMockWS as unknown as typeof WebSocket,
        autoConnect: false,
      });

      expect(provider.status).toBe("disconnected");

      provider.connect();
      expect(provider.status).toBe("connecting");

      createdWs!.open();
      expect(provider.status).toBe("connected");

      provider.disconnect();
      expect(provider.status).toBe("disconnected");

      provider.destroy();
    });
  });

  describe("Sync handshake and document updates", () => {
    it("sends SyncStep1 and awareness on connection open", () => {
      let createdWs: MockWebSocket | null = null;
      class CustomMockWS extends MockWebSocket {
        constructor(url: string) {
          super(url);
          createdWs = this;
        }
      }

      const provider = new CollabProvider({
        boardId: "board-sync-test",
        doc,
        WebSocketPolyfill: CustomMockWS as unknown as typeof WebSocket,
      });

      createdWs!.open();

      expect(createdWs!.sentMessages.length).toBeGreaterThanOrEqual(2);

      // Verify Message 1 is MESSAGE_SYNC (SyncStep1)
      const msg1 = createdWs!.sentMessages[0];
      const decoder1 = decoding.createDecoder(msg1);
      const type1 = decoding.readVarUint(decoder1);
      expect(type1).toBe(MESSAGE_SYNC);
      const syncType1 = decoding.readVarUint(decoder1);
      expect(syncType1).toBe(syncProtocol.messageYjsSyncStep1);

      // Verify Message 2 is MESSAGE_AWARENESS
      const msg2 = createdWs!.sentMessages[1];
      const decoder2 = decoding.createDecoder(msg2);
      const type2 = decoding.readVarUint(decoder2);
      expect(type2).toBe(MESSAGE_AWARENESS);

      provider.destroy();
    });

    it("responds to server SyncStep1 with SyncStep2 containing local document state", () => {
      let createdWs: MockWebSocket | null = null;
      class CustomMockWS extends MockWebSocket {
        constructor(url: string) {
          super(url);
          createdWs = this;
        }
      }

      // Add a note to the local document first
      doc.commit([
        {
          kind: "createElement",
          element: {
            id: "note-1",
            type: "rectangle",
            x: 10,
            y: 20,
            width: 100,
            height: 100,
          } as any,
        },
      ]);

      const provider = new CollabProvider({
        boardId: "board-sync-reply",
        doc,
        WebSocketPolyfill: CustomMockWS as unknown as typeof WebSocket,
      });

      createdWs!.open();
      createdWs!.sentMessages = []; // clear initial messages

      // Server sends SyncStep1 asking for missing state with an empty state vector
      const serverEncoder = encoding.createEncoder();
      encoding.writeVarUint(serverEncoder, MESSAGE_SYNC);
      encoding.writeVarUint(serverEncoder, syncProtocol.messageYjsSyncStep1);
      encoding.writeVarUint8Array(
        serverEncoder,
        Y.encodeStateVector(new Y.Doc()),
      );

      createdWs!.receive(encoding.toUint8Array(serverEncoder));

      // Client should reply with SyncStep2 containing the element
      expect(createdWs!.sentMessages.length).toBe(1);
      const reply = createdWs!.sentMessages[0];
      const decoder = decoding.createDecoder(reply);
      expect(decoding.readVarUint(decoder)).toBe(MESSAGE_SYNC);
      expect(decoding.readVarUint(decoder)).toBe(
        syncProtocol.messageYjsSyncStep2,
      );

      const update = decoding.readVarUint8Array(decoder);
      const receiverDoc = new Y.Doc();
      Y.applyUpdate(receiverDoc, update);
      expect(receiverDoc.getMap("elements").get("note-1")).toBeDefined();

      provider.destroy();
    });

    it("applies server SyncStep2 / updates to FiroDoc and does not echo back", () => {
      let createdWs: MockWebSocket | null = null;
      class CustomMockWS extends MockWebSocket {
        constructor(url: string) {
          super(url);
          createdWs = this;
        }
      }

      const provider = new CollabProvider({
        boardId: "board-apply-test",
        doc,
        WebSocketPolyfill: CustomMockWS as unknown as typeof WebSocket,
      });

      createdWs!.open();
      createdWs!.sentMessages = []; // clear initial messages

      // Prepare an update from a peer
      const peerDoc = createFiroDoc();
      peerDoc.commit([
        {
          kind: "createElement",
          element: {
            id: "remote-note-1",
            type: "stickynote",
            x: 50,
            y: 60,
          } as any,
        },
      ]);
      const updateFromPeer = Y.encodeStateAsUpdate(peerDoc.getRawYDoc());

      // Send update to client as MESSAGE_SYNC + messageYjsUpdate
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      encoding.writeVarUint(encoder, syncProtocol.messageYjsUpdate);
      encoding.writeVarUint8Array(encoder, updateFromPeer);

      createdWs!.receive(encoding.toUint8Array(encoder));

      // Assert document has remote element
      expect(doc.element("remote-note-1")).toBeDefined();
      expect(doc.element("remote-note-1")?.type).toBe("stickynote");

      // Assert client did NOT echo the remote update back to server!
      expect(createdWs!.sentMessages.length).toBe(0);

      provider.destroy();
    });

    it("streams local document commits to server", () => {
      let createdWs: MockWebSocket | null = null;
      class CustomMockWS extends MockWebSocket {
        constructor(url: string) {
          super(url);
          createdWs = this;
        }
      }

      const provider = new CollabProvider({
        boardId: "board-stream-test",
        doc,
        WebSocketPolyfill: CustomMockWS as unknown as typeof WebSocket,
      });

      createdWs!.open();
      createdWs!.sentMessages = []; // clear initial handshake

      // Local commit
      doc.commit([
        {
          kind: "createElement",
          element: {
            id: "local-note-99",
            type: "arrow",
            x: 0,
            y: 0,
          } as any,
        },
      ]);

      expect(createdWs!.sentMessages.length).toBe(1);
      const msg = createdWs!.sentMessages[0];
      const decoder = decoding.createDecoder(msg);
      expect(decoding.readVarUint(decoder)).toBe(MESSAGE_SYNC);
      expect(decoding.readVarUint(decoder)).toBe(syncProtocol.messageYjsUpdate);

      const update = decoding.readVarUint8Array(decoder);
      const serverDoc = new Y.Doc();
      Y.applyUpdate(serverDoc, update);
      expect(serverDoc.getMap("elements").get("local-note-99")).toBeDefined();

      provider.destroy();
    });
  });

  describe("Awareness propagation & collaborator listing", () => {
    it("tracks remote peer awareness states and notifies collaborators listener", () => {
      let createdWs: MockWebSocket | null = null;
      class CustomMockWS extends MockWebSocket {
        constructor(url: string) {
          super(url);
          createdWs = this;
        }
      }

      const provider = new CollabProvider({
        boardId: "board-collab-test",
        doc,
        WebSocketPolyfill: CustomMockWS as unknown as typeof WebSocket,
        user: { name: "Local User", color: "#0090FF" },
      });

      createdWs!.open();

      let latestCollabs: CollaboratorInfo[] = [];
      provider.onCollaboratorsChange((c) => {
        latestCollabs = c;
      });

      // Initially no remote peers
      expect(latestCollabs).toEqual([]);

      // Simulate receiving awareness update from remote peer 101
      const peerDoc = new Y.Doc();
      const peerAwareness = new awarenessProtocol.Awareness(peerDoc);
      peerAwareness.setLocalState({
        [AWARENESS_KEY]: {
          cursor: { x: 120, y: 340 },
          laser: null,
          idleSince: null,
        },
        user: {
          name: "Alice Remote",
          color: "#E5484D",
          role: "editor",
          tool: "selection",
        },
      });

      const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(
        peerAwareness,
        [peerAwareness.clientID],
      );

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(encoder, awarenessUpdate);

      createdWs!.receive(encoding.toUint8Array(encoder));

      // Assert collaborator is listed
      expect(latestCollabs.length).toBe(1);
      expect(latestCollabs[0].clientId).toBe(peerAwareness.clientID);
      expect(latestCollabs[0].name).toBe("Alice Remote");
      expect(latestCollabs[0].color).toBe("#E5484D");
      expect(latestCollabs[0].role).toBe("editor");
      expect(latestCollabs[0].cursor).toEqual({ x: 120, y: 340 });

      // Simulate remote peer updating to laser
      peerAwareness.setLocalState({
        [AWARENESS_KEY]: {
          cursor: null,
          laser: { x: 500, y: 600 },
          idleSince: null,
        },
        user: {
          name: "Alice Remote",
          color: "#E5484D",
          tool: "laser",
        },
      });
      const laserUpdate = awarenessProtocol.encodeAwarenessUpdate(
        peerAwareness,
        [peerAwareness.clientID],
      );
      const laserEncoder = encoding.createEncoder();
      encoding.writeVarUint(laserEncoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(laserEncoder, laserUpdate);

      createdWs!.receive(encoding.toUint8Array(laserEncoder));

      expect(latestCollabs[0].cursor).toBeNull();
      expect(latestCollabs[0].laser).toEqual({ x: 500, y: 600 });
      expect(latestCollabs[0].tool).toBe("laser");

      provider.destroy();
    });

    it("broadcasts local cursor, laser, user, and tool changes", () => {
      let createdWs: MockWebSocket | null = null;
      class CustomMockWS extends MockWebSocket {
        constructor(url: string) {
          super(url);
          createdWs = this;
        }
      }

      const provider = new CollabProvider({
        boardId: "board-broadcast-test",
        doc,
        WebSocketPolyfill: CustomMockWS as unknown as typeof WebSocket,
      });

      createdWs!.open();
      createdWs!.sentMessages = [];

      // 1. Set local cursor
      provider.setLocalCursor(150, 250);

      expect(createdWs!.sentMessages.length).toBeGreaterThan(0);
      const lastMsg = createdWs!.sentMessages.at(-1)!;
      const decoder = decoding.createDecoder(lastMsg);
      expect(decoding.readVarUint(decoder)).toBe(MESSAGE_AWARENESS);

      // Verify awareness has cursor
      const localState = provider.awareness.getLocalState() as Record<
        string,
        any
      >;
      expect(localState[AWARENESS_KEY].cursor).toEqual({ x: 150, y: 250 });
      expect(localState.cursor).toEqual({ x: 150, y: 250 });

      // 2. Set local laser
      provider.setLocalLaser(300, 400);
      expect(
        provider.awareness.getLocalState()?.[AWARENESS_KEY]?.laser,
      ).toEqual({ x: 300, y: 400 });

      // 3. Set local tool
      provider.setLocalTool("rectangle");
      expect((provider.awareness.getLocalState()?.user as any)?.tool).toBe(
        "rectangle",
      );

      // 4. Set local user
      provider.setLocalUser({ name: "Bob Tester", color: "#30A46C" });
      expect((provider.awareness.getLocalState()?.user as any)?.name).toBe(
        "Bob Tester",
      );
      expect((provider.awareness.getLocalState()?.user as any)?.color).toBe(
        "#30A46C",
      );

      provider.destroy();
    });
  });

  it("does not notify awareness or collaborators for an unchanged tool", () => {
    const provider = new CollabProvider({
      boardId: "tool-feedback-regression",
      doc,
      WebSocketPolyfill: MockWebSocket as unknown as typeof WebSocket,
    });
    const updated = vi.fn();
    provider.awareness.on("update", updated);
    const collaborators = vi.fn();
    const unsubscribe = provider.onCollaboratorsChange(collaborators);
    collaborators.mockClear();

    provider.setLocalTool("rectangle");
    expect(updated).toHaveBeenCalledTimes(1);
    expect(collaborators).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 100; i++) {
      provider.setLocalTool("rectangle");
    }
    expect(updated).toHaveBeenCalledTimes(1);
    expect(collaborators).toHaveBeenCalledTimes(1);

    provider.setLocalTool("ellipse");
    expect(updated).toHaveBeenCalledTimes(2);
    expect(collaborators).toHaveBeenCalledTimes(2);
    expect(provider.awareness.getLocalState()?.user.tool).toBe("ellipse");
    unsubscribe();
    provider.destroy();
  });

  describe("resolveShareToken", () => {
    it("fetches /api/shares/:token and extracts share details", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          share: {
            boardId: "board-share-resolved",
            role: "editor",
            requiresPassword: false,
          },
        }),
      });
      global.fetch = mockFetch;

      const result = await resolveShareToken(
        "tok-test-123",
        "https://api.firo.test",
      );
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.firo.test/api/shares/tok-test-123",
      );
      expect(result).toEqual({
        boardId: "board-share-resolved",
        role: "editor",
        requiresPassword: false,
      });
    });

    it("returns null if response is not ok", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await resolveShareToken("invalid-tok");
      expect(result).toBeNull();
    });
  });
});
