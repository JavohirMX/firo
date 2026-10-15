import { FiroServer } from "./app.js";

export * from "./config.js";
export * from "./db/index.js";
export * from "./auth/index.js";
export * from "./ws/index.js";
export * from "./http/index.js";
export * from "./app.js";

// Run directly if invoked as main script
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new FiroServer();
  server
    .start()
    .then(({ port, host }) => {
      // eslint-disable-next-line no-console
      console.log(`[Firo Server] Listening on http://${host}:${port}`);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[Firo Server] Startup failure:", err);
      process.exit(1);
    });
}
