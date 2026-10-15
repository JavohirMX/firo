/**
 * Stdio JSON-RPC 2.0 Model Context Protocol Server for Firo (Phase 10.2).
 */

import { MemoryBoardStore } from "./store.js";
import { createMcpTools } from "./tools.js";

import type { BoardStore } from "./store.js";
import type { ToolDefinition } from "./tools.js";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, any>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export class McpServer {
  private store: BoardStore;
  private tools: Map<string, ToolDefinition>;
  private protocolVersion = "2024-11-05";

  constructor(options?: { store?: BoardStore }) {
    this.store = options?.store ?? new MemoryBoardStore();
    this.tools = createMcpTools(this.store);
  }

  getStore(): BoardStore {
    return this.store;
  }

  getTools(): Map<string, ToolDefinition> {
    return this.tools;
  }

  /**
   * Handle an incoming JSON-RPC 2.0 request or notification.
   * Returns null if the request was a notification (no id) and requires no response.
   */
  async handleRequest(raw: unknown): Promise<JsonRpcResponse | null> {
    if (!raw || typeof raw !== "object") {
      return {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid Request: expected an object" },
      };
    }

    const req = raw as Partial<JsonRpcRequest>;
    const id = req.id !== undefined ? req.id : null;
    const isNotification = req.id === undefined;

    if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
      if (isNotification) {
        return null;
      }
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32600,
          message: "Invalid Request: missing jsonrpc '2.0' or valid method",
        },
      };
    }

    try {
      switch (req.method) {
        case "initialize": {
          const clientProtocolVersion = req.params?.protocolVersion;
          if (
            clientProtocolVersion &&
            typeof clientProtocolVersion === "string"
          ) {
            this.protocolVersion = clientProtocolVersion;
          }

          return {
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: this.protocolVersion,
              capabilities: {
                tools: {},
              },
              serverInfo: {
                name: "firo-mcp",
                version: "0.1.0",
              },
            },
          };
        }

        case "notifications/initialized":
        case "initialized": {
          // Handshake complete notification
          return null;
        }

        case "ping": {
          return {
            jsonrpc: "2.0",
            id,
            result: {},
          };
        }

        case "tools/list": {
          const list = Array.from(this.tools.values()).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          }));

          return {
            jsonrpc: "2.0",
            id,
            result: { tools: list },
          };
        }

        case "tools/call": {
          const params = req.params;
          if (!params || typeof params.name !== "string") {
            return {
              jsonrpc: "2.0",
              id,
              error: {
                code: -32602,
                message: "Invalid params: missing tool name",
              },
            };
          }

          const tool = this.tools.get(params.name);
          if (!tool) {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: `Unknown tool: "${params.name}"`,
                  },
                ],
                isError: true,
              },
            };
          }

          try {
            const toolArgs = params.arguments ?? {};
            const res = await tool.execute(toolArgs);
            const textResult =
              typeof res === "string" ? res : JSON.stringify(res, null, 2);

            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: textResult,
                  },
                ],
                isError: false,
              },
            };
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: `Error executing tool "${params.name}": ${message}`,
                  },
                ],
                isError: true,
              },
            };
          }
        }

        default: {
          if (isNotification) {
            return null;
          }
          return {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32601,
              message: `Method not found: "${req.method}"`,
            },
          };
        }
      }
    } catch (err: unknown) {
      if (isNotification) {
        return null;
      }
      const message = err instanceof Error ? err.message : String(err);
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: `Internal error: ${message}` },
      };
    }
  }

  /**
   * Start listening on stdio streams (newline-delimited JSON with Content-Length support).
   */
  startStdio(
    stdin: NodeJS.ReadableStream = process.stdin,
    stdout: NodeJS.WritableStream = process.stdout,
  ): () => void {
    let buffer = "";

    const onData = async (chunk: Buffer | string) => {
      buffer += chunk.toString("utf8");

      while (buffer.length > 0) {
        // 1. Check for Content-Length framing (LSP/MCP standard)
        if (buffer.startsWith("Content-Length:")) {
          const headerEnd = buffer.indexOf("\r\n\r\n");
          if (headerEnd === -1) {
            // Need more data
            break;
          }
          const header = buffer.slice(0, headerEnd);
          const match = header.match(/Content-Length:\s*(\d+)/i);
          if (!match) {
            buffer = buffer.slice(headerEnd + 4);
            continue;
          }
          const contentLength = parseInt(match[1], 10);
          const bodyStart = headerEnd + 4;
          if (buffer.length < bodyStart + contentLength) {
            // Body not complete yet
            break;
          }
          const body = buffer.slice(bodyStart, bodyStart + contentLength);
          buffer = buffer.slice(bodyStart + contentLength);

          try {
            const json = JSON.parse(body);
            const response = await this.handleRequest(json);
            if (response) {
              const resJson = JSON.stringify(response);
              stdout.write(
                `Content-Length: ${Buffer.byteLength(
                  resJson,
                  "utf8",
                )}\r\n\r\n${resJson}`,
              );
            }
          } catch {
            const errRes: JsonRpcResponse = {
              jsonrpc: "2.0",
              id: null,
              error: { code: -32700, message: "Parse error" },
            };
            const errJson = JSON.stringify(errRes);
            stdout.write(
              `Content-Length: ${Buffer.byteLength(
                errJson,
                "utf8",
              )}\r\n\r\n${errJson}`,
            );
          }
          continue;
        }

        // 2. Newline-delimited JSON framing
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) {
          // Wait for newline
          break;
        }

        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (!line) {
          continue;
        }

        try {
          const json = JSON.parse(line);
          const response = await this.handleRequest(json);
          if (response) {
            stdout.write(`${JSON.stringify(response)}\n`);
          }
        } catch {
          const errRes: JsonRpcResponse = {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
          };
          stdout.write(`${JSON.stringify(errRes)}\n`);
        }
      }
    };

    stdin.on("data", onData);

    return () => {
      stdin.removeListener("data", onData);
    };
  }
}

/**
 * Start the Stdio Server.
 */
export const startStdioServer = async (options?: {
  store?: BoardStore;
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
}): Promise<{ server: McpServer; close: () => void }> => {
  const server = new McpServer({ store: options?.store });
  const close = server.startStdio(options?.stdin, options?.stdout);
  return { server, close };
};
