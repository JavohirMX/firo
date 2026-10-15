import { PassThrough } from "stream";

import { describe, expect, it } from "vitest";

import { McpServer } from "../src/server";
import { MemoryBoardStore } from "../src/store";

describe("McpServer JSON-RPC and Stdio Protocol", () => {
  it("completes MCP initialize handshake and ping", async () => {
    const server = new McpServer();

    // 1. initialize request
    const initRes = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      },
    });

    expect(initRes).toBeDefined();
    expect(initRes?.id).toBe(1);
    expect(initRes?.result).toMatchObject({
      protocolVersion: "2024-11-05",
      serverInfo: {
        name: "firo-mcp",
        version: "0.1.0",
      },
      capabilities: {
        tools: {},
      },
    });

    // 2. initialized notification (no response)
    const notifyRes = await server.handleRequest({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(notifyRes).toBeNull();

    // 3. ping request
    const pingRes = await server.handleRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "ping",
    });
    expect(pingRes).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: {},
    });
  });

  it("lists all available MCP tools with schemas", async () => {
    const server = new McpServer();

    const res = await server.handleRequest({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/list",
    });

    expect(res).toBeDefined();
    expect(res?.id).toBe(10);
    const result = res?.result as {
      tools: Array<{ name: string; description: string; inputSchema: any }>;
    };
    expect(result.tools).toBeInstanceOf(Array);

    const toolNames = result.tools.map((t) => t.name);
    expect(toolNames).toContain("board_search");
    expect(toolNames).toContain("board_read");
    expect(toolNames).toContain("board_create");
    expect(toolNames).toContain("board_apply_diff");
    expect(toolNames).toContain("records_query");
    expect(toolNames).toContain("records_update");
    expect(toolNames).toContain("comment_thread_create");
    expect(toolNames).toContain("comment_thread_reply");

    for (const tool of result.tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("executes tools via tools/call and returns standard MCP content payload", async () => {
    const store = new MemoryBoardStore();
    const server = new McpServer({ store });

    // 1. Create board
    const createCall = await server.handleRequest({
      jsonrpc: "2.0",
      id: "call-1",
      method: "tools/call",
      params: {
        name: "board_create",
        arguments: {
          title: "Sprint Retrospective",
          elements: [
            {
              id: "note-retro-1",
              type: "stickynote",
              x: 50,
              y: 50,
              width: 200,
              height: 200,
              text: "What went well?",
            },
          ],
        },
      },
    });

    expect(createCall?.id).toBe("call-1");
    const createPayload = createCall?.result as {
      content: Array<{ type: string; text: string }>;
      isError: boolean;
    };
    expect(createPayload.isError).toBe(false);
    expect(createPayload.content[0].type).toBe("text");
    const createData = JSON.parse(createPayload.content[0].text);
    expect(createData.success).toBe(true);
    const boardId = createData.boardId;
    expect(boardId).toBeTruthy();

    // 2. Read board
    const readCall = await server.handleRequest({
      jsonrpc: "2.0",
      id: "call-2",
      method: "tools/call",
      params: {
        name: "board_read",
        arguments: {
          boardId,
          format: "json",
        },
      },
    });

    const readPayload = readCall?.result as {
      content: Array<{ type: string; text: string }>;
      isError: boolean;
    };
    expect(readPayload.isError).toBe(false);
    const boardData = JSON.parse(readPayload.content[0].text);
    expect(boardData.title).toBe("Sprint Retrospective");
    expect(boardData.elements.length).toBe(1);
    expect(boardData.elements[0].text).toBe("What went well?");

    // 3. Error case: board not found
    const missingCall = await server.handleRequest({
      jsonrpc: "2.0",
      id: "call-3",
      method: "tools/call",
      params: {
        name: "board_read",
        arguments: {
          boardId: "non-existent-board",
        },
      },
    });

    const missingPayload = missingCall?.result as {
      content: Array<{ type: string; text: string }>;
      isError: boolean;
    };
    expect(missingPayload.isError).toBe(true);
    expect(missingPayload.content[0].text).toContain("not found");
  });

  it("returns -32601 for unknown methods", async () => {
    const server = new McpServer();

    const res = await server.handleRequest({
      jsonrpc: "2.0",
      id: 99,
      method: "unknown_method",
    });

    expect(res).toEqual({
      jsonrpc: "2.0",
      id: 99,
      error: {
        code: -32601,
        message: 'Method not found: "unknown_method"',
      },
    });
  });

  it("handles newline-delimited stream communication over stdio", async () => {
    const server = new McpServer();
    const stdin = new PassThrough();
    const stdout = new PassThrough();

    const responses: any[] = [];

    stdout.on("data", (chunk: Buffer) => {
      const lines = chunk.toString("utf8").split("\n").filter(Boolean);
      for (const line of lines) {
        responses.push(JSON.parse(line));
      }
    });

    const close = server.startStdio(stdin, stdout);

    // Send initialize request followed by ping
    stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05" },
      })}\n`,
    );

    stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "ping",
      })}\n`,
    );

    // Allow event loop to process
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(responses.length).toBe(2);
    expect(responses[0].id).toBe(1);
    expect(responses[0].result.serverInfo.name).toBe("firo-mcp");
    expect(responses[1].id).toBe(2);
    expect(responses[1].result).toEqual({});

    close();
  });
});
