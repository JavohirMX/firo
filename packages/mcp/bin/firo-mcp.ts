#!/usr/bin/env node

/**
 * CLI binary for Firo MCP Server.
 *
 * Communicates via JSON-RPC 2.0 over stdio with AI agents and MCP clients.
 */

import { startStdioServer } from "../src/server.js";
import { MemoryBoardStore } from "../src/store.js";

const main = async () => {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    process.stderr.write(
      `Firo Model Context Protocol (MCP) Server\n\n` +
        `Usage:\n` +
        `  firo-mcp [options]\n\n` +
        `Options:\n` +
        `  -h, --help     Show this help message\n` +
        `  -v, --version  Show version\n\n` +
        `Communication is over stdio using JSON-RPC 2.0 (newline-delimited JSON or Content-Length framing).\n`,
    );
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    process.stderr.write("0.1.0\n");
    process.exit(0);
  }

  const store = new MemoryBoardStore();
  // Pre-seed an initial default board
  await store.createBoard("Default Board", { id: "board-default" });

  const { close } = await startStdioServer({ store });

  process.stderr.write("[firo-mcp] Server started and listening on stdio.\n");

  const onExit = () => {
    close();
    process.exit(0);
  };

  process.on("SIGINT", onExit);
  process.on("SIGTERM", onExit);
};

main().catch((err) => {
  process.stderr.write(
    `[firo-mcp] Fatal error: ${
      err instanceof Error ? err.message : String(err)
    }\n`,
  );
  process.exit(1);
});
