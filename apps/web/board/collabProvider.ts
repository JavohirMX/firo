import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import {
  AWARENESS_KEY,
  applyRemoteUpdate,
  REMOTE_ORIGIN,
  type EphemeralState,
  type FiroDoc,
} from "@firo/doc";

import { getCollaboratorColor } from "../components/RemoteCursorLayer";

export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;
export const MESSAGE_AUTH = 2;
export const MESSAGE_QUERY_AWARENESS = 3;

export type CollabStatus = "connecting" | "connected" | "disconnected";

export interface CollaboratorInfo {
  clientId: number;
  name?: string;
  color?: string;
  avatar?: string;
  role?: string;
  cursor?: { x: number; y: number } | null;
  laser?: { x: number; y: number } | null;
  tool?: string;
  idleSince?: number | null;
  isIdle?: boolean;
}

export interface CollabProviderOptions {
  boardId: string;
  doc: FiroDoc;
  wsUrl?: string;
  shareToken?: string | null;
  user?: {
    name?: string;
    color?: string;
    avatar?: string;
    role?: string;
    tool?: string;
  };
  WebSocketPolyfill?: typeof WebSocket;
  autoConnect?: boolean;
  reconnectIntervalMs?: number;
  maxReconnectIntervalMs?: number;
}

export function buildRelayWsUrl(
  boardId: string,
  shareToken?: string | null,
  configuredBaseUrl?: string,
): string {
  let base = configuredBaseUrl;
  if (!base) {
    if (typeof process !== "undefined" && process.env?.FIRO_WS_URL) {
      base = process.env.FIRO_WS_URL;
    } else if (
      typeof import.meta !== "undefined" &&
      (import.meta as unknown as { env?: Record<string, string> }).env
        ?.VITE_FIRO_WS_URL
    ) {
      base = (import.meta as unknown as { env: Record<string, string> }).env
        .VITE_FIRO_WS_URL;
    } else if (
      typeof import.meta !== "undefined" &&
      (import.meta as unknown as { env?: Record<string, string> }).env
        ?.FIRO_WS_URL
    ) {
      base = (import.meta as unknown as { env: Record<string, string> }).env
        .FIRO_WS_URL;
    } else if (typeof window !== "undefined" && window.location) {
      const isHttps = window.location.protocol === "https:";
      const host = window.location.host;
      if (
        host.includes(":5001") ||
        host.includes(":3000") ||
        host.includes(":5173")
      ) {
        base = "ws://localhost:8080/ws";
      } else {
        base = `${isHttps ? "wss" : "ws"}://${host}/ws`;
      }
    } else {
      base = "ws://localhost:8080/ws";
    }
  }

  const hasQuery = base.includes("?");
  const separator = hasQuery ? "&" : "?";
  let url = base;
  if (!base.includes("boardId=")) {
    url += `${separator}boardId=${encodeURIComponent(boardId)}`;
  }
  if (shareToken && !url.includes("shareToken=") && !url.includes("share=")) {
    url += `&shareToken=${encodeURIComponent(shareToken)}`;
  }
  return url;
}

export async function resolveShareToken(
  token: string,
  apiBase = "",
): Promise<{
  boardId: string;
  role: string;
  requiresPassword?: boolean;
} | null> {
  try {
    const res = await fetch(
      `${apiBase}/api/shares/${encodeURIComponent(token)}`,
    );
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    return data?.share ?? null;
  } catch (err) {
    console.error("[CollabProvider] Failed to resolve share token:", err);
    return null;
  }
}

export class CollabProvider {
  public readonly boardId: string;
  public readonly doc: FiroDoc;
  public readonly awareness: awarenessProtocol.Awareness;
  public readonly wsUrl: string;
  public readonly shareToken: string | null;

  private ws: WebSocket | null = null;
  private _status: CollabStatus = "disconnected";
  private readonly WSClass: typeof WebSocket;
  private readonly autoConnect: boolean;
  private isDestroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly reconnectIntervalMs: number;
  private readonly maxReconnectIntervalMs: number;

  private readonly statusListeners = new Set<(status: CollabStatus) => void>();
  private readonly collaboratorListeners = new Set<
    (collaborators: CollaboratorInfo[]) => void
  >();
  private readonly updateListeners = new Set<() => void>();

  constructor(options: CollabProviderOptions) {
    this.boardId = options.boardId;
    this.doc = options.doc;
    this.awareness = options.doc.awareness;
    this.shareToken = options.shareToken ?? null;
    this.wsUrl = buildRelayWsUrl(
      options.boardId,
      options.shareToken,
      options.wsUrl,
    );

    this.WSClass =
      options.WebSocketPolyfill ??
      (typeof WebSocket !== "undefined"
        ? WebSocket
        : (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket);

    this.autoConnect = options.autoConnect ?? true;
    this.reconnectIntervalMs = options.reconnectIntervalMs ?? 1000;
    this.maxReconnectIntervalMs = options.maxReconnectIntervalMs ?? 10000;

    // Initialize local user identity in awareness
    const clientColor = getCollaboratorColor(this.awareness.clientID);
    this.setLocalUser({
      name: options.user?.name ?? `User ${this.awareness.clientID}`,
      color: options.user?.color ?? clientColor,
      avatar: options.user?.avatar,
      role: options.user?.role,
      tool: options.user?.tool,
    });

    // Observe local durable document updates and awareness changes
    this.doc.getRawYDoc().on("update", this.handleDocUpdate);
    this.awareness.on("update", this.handleAwarenessUpdate);

    if (this.autoConnect) {
      this.connect();
    }
  }

  public get status(): CollabStatus {
    return this._status;
  }

  public get isConnected(): boolean {
    return this._status === "connected";
  }

  public get collaborators(): CollaboratorInfo[] {
    const states = this.awareness.getStates();
    const localClientId = this.awareness.clientID;
    const list: CollaboratorInfo[] = [];

    states.forEach((state, clientId) => {
      if (clientId === localClientId) {
        return; // Skip local user in remote list
      }

      const raw = state as Record<string, unknown>;
      const firoState = raw[AWARENESS_KEY] as EphemeralState | undefined;
      const user = raw.user as
        | {
            name?: string;
            color?: string;
            avatar?: string;
            role?: string;
            tool?: string;
          }
        | undefined;

      const cursor =
        firoState?.cursor ??
        (raw.cursor as { x: number; y: number } | null) ??
        null;
      const laser =
        firoState?.laser ??
        (raw.laser as { x: number; y: number } | null) ??
        null;
      const idleSince =
        firoState?.idleSince ?? (raw.idleSince as number | null) ?? null;
      const name =
        user?.name ??
        (firoState as unknown as { name?: string })?.name ??
        `User ${clientId}`;
      const color = user?.color ?? getCollaboratorColor(clientId);
      const role = user?.role;
      const avatar = user?.avatar;
      const tool = user?.tool;
      const isIdle =
        idleSince !== null && Date.now() - (idleSince as number) > 5000;

      list.push({
        clientId,
        name,
        color,
        avatar,
        role,
        cursor,
        laser,
        tool,
        idleSince,
        isIdle,
      });
    });

    return list;
  }

  public connect(): void {
    if (this.isDestroyed) {
      return;
    }
    if (
      this.ws &&
      (this.ws.readyState === 0 || this.ws.readyState === 1) // CONNECTING or OPEN
    ) {
      return;
    }

    this.setStatus("connecting");

    try {
      this.ws = new this.WSClass(this.wsUrl);
      if ("binaryType" in this.ws) {
        (this.ws as unknown as { binaryType: string }).binaryType =
          "arraybuffer";
      }

      this.ws.onopen = this.handleOpen;
      this.ws.onmessage = this.handleMessage;
      this.ws.onclose = this.handleClose;
      this.ws.onerror = this.handleError;
    } catch (err) {
      console.error("[CollabProvider] Failed to open WebSocket:", err);
      this.handleClose();
    }
  }

  public disconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    this.setStatus("disconnected");
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.disconnect();

    this.doc.getRawYDoc().off("update", this.handleDocUpdate);
    this.awareness.off("update", this.handleAwarenessUpdate);

    awarenessProtocol.removeAwarenessStates(
      this.awareness,
      [this.awareness.clientID],
      this,
    );

    this.statusListeners.clear();
    this.collaboratorListeners.clear();
    this.updateListeners.clear();
  }

  public send(msg: Uint8Array): void {
    if (this.ws && this.ws.readyState === 1) {
      try {
        this.ws.send(msg);
      } catch (err) {
        console.error("[CollabProvider] Error sending message:", err);
      }
    }
  }

  public setLocalCursor(x: number | null, y: number | null): void {
    const cursor = x !== null && y !== null ? { x, y } : null;
    this.doc.setEphemeral({
      cursor,
      idleSince: cursor ? null : Date.now(),
    });
    this.awareness.setLocalStateField("cursor", cursor);
  }

  public setLocalLaser(x: number | null, y: number | null): void {
    const laser = x !== null && y !== null ? { x, y } : null;
    this.doc.setEphemeral({ laser });
    this.awareness.setLocalStateField("laser", laser);
  }

  public setLocalUser(
    user: Partial<{
      name: string;
      color: string;
      avatar: string;
      role: string;
      tool: string;
    }>,
  ): void {
    const current =
      (this.awareness.getLocalState()?.user as Record<string, unknown>) || {};
    this.awareness.setLocalStateField("user", {
      ...current,
      ...user,
    });
  }

  public setLocalTool(tool: string): void {
    // onChange runs after every editor render, including awareness renders.
    // Re-announcing an unchanged tool would notify collaborators and render
    // the editor again, creating a synchronous feedback loop.
    if (this.awareness.getLocalState()?.user?.tool === tool) {
      return;
    }
    this.setLocalUser({ tool });
  }

  public onStatusChange(listener: (status: CollabStatus) => void): () => void {
    listener(this._status);
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  public onCollaboratorsChange(
    listener: (collaborators: CollaboratorInfo[]) => void,
  ): () => void {
    listener(this.collaborators);
    this.collaboratorListeners.add(listener);
    return () => this.collaboratorListeners.delete(listener);
  }

  public subscribe(listener: () => void): () => void {
    listener();
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  private handleOpen = () => {
    this.reconnectAttempts = 0;
    this.setStatus("connected");

    // 1. Sync handshake: Send SyncStep1 with our state vector to server
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc.getRawYDoc());
    this.send(encoding.toUint8Array(encoder));

    // 2. Broadcast local awareness state to relay
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, [
        this.awareness.clientID,
      ]),
    );
    this.send(encoding.toUint8Array(awarenessEncoder));
  };

  private handleMessage = (event: MessageEvent | { data: unknown }) => {
    const rawData = "data" in event ? event.data : event;
    let uint8: Uint8Array;
    if (rawData instanceof Uint8Array) {
      uint8 = rawData;
    } else if (rawData instanceof ArrayBuffer) {
      uint8 = new Uint8Array(rawData);
    } else if (typeof Buffer !== "undefined" && Buffer.isBuffer(rawData)) {
      uint8 = new Uint8Array(
        rawData.buffer,
        rawData.byteOffset,
        rawData.byteLength,
      );
    } else if (ArrayBuffer.isView(rawData)) {
      uint8 = new Uint8Array(
        rawData.buffer,
        rawData.byteOffset,
        rawData.byteLength,
      );
    } else if (typeof rawData === "string") {
      uint8 = new TextEncoder().encode(rawData);
    } else {
      return;
    }

    try {
      const decoder = decoding.createDecoder(uint8);
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case MESSAGE_SYNC: {
          this.handleSyncMessage(decoder);
          break;
        }
        case MESSAGE_AWARENESS: {
          const update = decoding.readVarUint8Array(decoder);
          awarenessProtocol.applyAwarenessUpdate(this.awareness, update, this);
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
          this.send(encoding.toUint8Array(encoder));
          break;
        }
        default:
          break;
      }
    } catch (err) {
      console.error("[CollabProvider] Error processing message:", err);
    }
  };

  private handleSyncMessage(decoder: decoding.Decoder): void {
    const syncMessageType = decoding.readVarUint(decoder);

    switch (syncMessageType) {
      case syncProtocol.messageYjsSyncStep1: {
        // Server asks for client updates: respond with SyncStep2
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncStep1(decoder, encoder, this.doc.getRawYDoc());
        this.send(encoding.toUint8Array(encoder));
        break;
      }
      case syncProtocol.messageYjsSyncStep2:
      case syncProtocol.messageYjsUpdate: {
        // Server sends state update: apply to FiroDoc with remote origin
        const update = decoding.readVarUint8Array(decoder);
        applyRemoteUpdate(this.doc, update);
        break;
      }
      default:
        break;
    }
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    // Avoid echoing remote updates back to server
    if (origin === REMOTE_ORIGIN || origin === this) {
      return;
    }
    if (this._status !== "connected" || !this.ws || this.ws.readyState !== 1) {
      return;
    }

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    encoding.writeVarUint(encoder, syncProtocol.messageYjsUpdate);
    encoding.writeVarUint8Array(encoder, update);
    this.send(encoding.toUint8Array(encoder));
  };

  private handleAwarenessUpdate = (
    {
      added,
      updated,
      removed,
    }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    const changedClients = added.concat(updated, removed);
    if (
      origin !== this &&
      this._status === "connected" &&
      this.ws &&
      this.ws.readyState === 1
    ) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients),
      );
      this.send(encoding.toUint8Array(encoder));
    }
    this.notifyCollaborators();
  };

  private handleClose = () => {
    this.ws = null;
    this.setStatus("disconnected");

    // Remove remote awareness states when disconnected
    const remoteClientIds = Array.from(
      this.awareness.getStates().keys(),
    ).filter((id) => id !== this.awareness.clientID);
    if (remoteClientIds.length > 0) {
      awarenessProtocol.removeAwarenessStates(
        this.awareness,
        remoteClientIds,
        this,
      );
    }

    if (!this.isDestroyed && this.autoConnect) {
      this.scheduleReconnect();
    }
  };

  private handleError = (err: Event | unknown) => {
    console.error("[CollabProvider] WebSocket error:", err);
    this.handleClose();
  };

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.isDestroyed) {
      return;
    }
    const delay = Math.min(
      this.reconnectIntervalMs * Math.pow(1.5, this.reconnectAttempts),
      this.maxReconnectIntervalMs,
    );
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isDestroyed) {
        this.connect();
      }
    }, delay);
  }

  private setStatus(status: CollabStatus): void {
    if (this._status === status) {
      return;
    }
    this._status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
    for (const listener of this.updateListeners) {
      listener();
    }
  }

  private notifyCollaborators(): void {
    const collabs = this.collaborators;
    for (const listener of this.collaboratorListeners) {
      listener(collabs);
    }
    for (const listener of this.updateListeners) {
      listener();
    }
  }
}
