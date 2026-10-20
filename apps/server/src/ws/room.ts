import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

import { canRoleWriteUpdate } from "./permissions.js";

import type { Storage } from "../db/storage.js";
import type { ClientConnection } from "./connection.js";

export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;
export const MESSAGE_AUTH = 2;
export const MESSAGE_QUERY_AWARENESS = 3;

export class Room {
  public readonly boardId: string;
  public readonly doc: Y.Doc;
  public readonly awareness: awarenessProtocol.Awareness;
  public readonly clients: Set<ClientConnection> = new Set();
  public readonly storage: Storage;
  private readonly onAwarenessUpdate: (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => void;

  constructor(boardId: string, storage: Storage) {
    this.boardId = boardId;
    this.storage = storage;
    this.doc = storage.loadBoardDocument(boardId);
    this.awareness = new awarenessProtocol.Awareness(this.doc);

    this.onAwarenessUpdate = ({ added, updated, removed }, origin) => {
      const changedClients = added.concat(updated, removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients),
      );
      const msg = encoding.toUint8Array(encoder);
      for (const client of this.clients) {
        if (client !== origin) {
          client.send(msg);
        }
      }
    };

    this.awareness.on("update", this.onAwarenessUpdate);
  }

  public addClient(client: ClientConnection): void {
    this.clients.add(client);

    // Request offline document edits only from roles allowed to edit the board.
    // A SyncStep1 makes the browser upload its local Yjs state as SyncStep2.
    // Read-only/comment-only browsers may have locally seeded board metadata;
    // asking for that upload immediately violates their write permissions and
    // disconnects an otherwise valid reader before they do anything.
    if (client.role === "owner" || client.role === "editor") {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(encoder, this.doc);
      client.send(encoding.toUint8Array(encoder));
    }

    // Send full document state to client so client is in sync immediately
    const step2Encoder = encoding.createEncoder();
    encoding.writeVarUint(step2Encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep2(step2Encoder, this.doc);
    client.send(encoding.toUint8Array(step2Encoder));

    // 2. Send current awareness states to client
    const states = this.awareness.getStates();
    if (states.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(
          this.awareness,
          Array.from(states.keys()),
        ),
      );
      client.send(encoding.toUint8Array(awarenessEncoder));
    }
  }

  public removeClient(client: ClientConnection): void {
    this.clients.delete(client);
  }

  public handleMessage(client: ClientConnection, data: Uint8Array): void {
    try {
      const decoder = decoding.createDecoder(data);
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case MESSAGE_SYNC: {
          this.handleSyncMessage(client, decoder);
          break;
        }
        case MESSAGE_AWARENESS: {
          const update = decoding.readVarUint8Array(decoder);
          awarenessProtocol.applyAwarenessUpdate(
            this.awareness,
            update,
            client,
          );
          break;
        }
        case MESSAGE_QUERY_AWARENESS: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
          encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(
              this.awareness,
              Array.from(this.awareness.getStates().keys()),
            ),
          );
          client.send(encoding.toUint8Array(encoder));
          break;
        }
        default:
          break;
      }
    } catch (err) {
      // Malformed message
      console.error(`[Room ${this.boardId}] Error processing message:`, err);
    }
  }

  private handleSyncMessage(
    client: ClientConnection,
    decoder: decoding.Decoder,
  ): void {
    const syncMessageType = decoding.readVarUint(decoder);

    switch (syncMessageType) {
      case syncProtocol.messageYjsSyncStep1: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncStep1(decoder, encoder, this.doc);
        client.send(encoding.toUint8Array(encoder));
        break;
      }
      case syncProtocol.messageYjsSyncStep2:
      case syncProtocol.messageYjsUpdate: {
        // Authorisation check on every update frame
        const currentRole = client.refreshRole();
        if (!currentRole) {
          // Demoted or revoked mid-session: disconnect immediately
          client.close(4403, "Access revoked");
          this.removeClient(client);
          return;
        }

        const updateBytes = decoding.readVarUint8Array(decoder);

        // Check if role allows this write
        if (currentRole === "viewer") {
          // A demoted editor or viewer attempting write: disconnect
          client.close(4403, "Viewers cannot write");
          this.removeClient(client);
          return;
        }

        const isAllowed = canRoleWriteUpdate(
          currentRole,
          this.doc,
          updateBytes,
        );
        if (!isAllowed) {
          // Unauthorized write attempt (e.g. Commenter writing elements/records):
          // log violation, reject update, and disconnect socket
          console.warn(
            `[Room ${this.boardId}] Unauthorized write attempt by client ${
              client.userId || "anonymous"
            } (role: ${currentRole}). Disconnecting.`,
          );
          client.close(4403, "Unauthorized write attempt");
          this.removeClient(client);
          return;
        }

        // Apply update to authoritative room document
        Y.applyUpdate(this.doc, updateBytes, client);

        // Persist update to SQLite
        this.storage.appendUpdate(this.boardId, updateBytes);

        // Broadcast update to all other connected clients
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        encoding.writeVarUint(encoder, syncProtocol.messageYjsUpdate);
        encoding.writeVarUint8Array(encoder, updateBytes);
        const broadcastMsg = encoding.toUint8Array(encoder);

        for (const other of this.clients) {
          if (other !== client) {
            other.send(broadcastMsg);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  public destroy(): void {
    this.awareness.off("update", this.onAwarenessUpdate);
    for (const client of this.clients) {
      client.close(1001, "Room closing");
    }
    this.clients.clear();
    this.doc.destroy();
  }
}
