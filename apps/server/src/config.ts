import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerConfig {
  port: number;
  host: string;
  dataDir: string;
  dbPath: string;
  webDir: string;
  sessionTtlMs: number;
  authRateLimitMax: number;
  authRateLimitWindowMs: number;
  allowOpenRegistration: boolean;
}

export function loadConfig(
  overrides: Partial<ServerConfig> = {},
): ServerConfig {
  const dataDir =
    overrides.dataDir ??
    process.env.FIRO_DATA_DIR ??
    path.resolve(process.cwd(), "data");
  const dbPath =
    overrides.dbPath ??
    process.env.FIRO_DB_PATH ??
    path.join(dataDir, "firo.sqlite");

  const resolveDefaultWebDir = (): string => {
    if (process.env.FIRO_WEB_DIR) {
      return path.resolve(process.env.FIRO_WEB_DIR);
    }
    const candidates = [
      path.resolve(process.cwd(), "public"),
      path.resolve(process.cwd(), "apps/web/dist"),
      path.resolve(process.cwd(), "apps/web/build"),
      path.resolve(__dirname, "../../web/dist"),
      path.resolve(__dirname, "../../web/build"),
      path.resolve(__dirname, "../../../apps/web/dist"),
      path.resolve(__dirname, "../../../apps/web/build"),
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        return cand;
      }
    }
    return path.resolve(__dirname, "../../web/dist");
  };

  const webDir = overrides.webDir
    ? path.resolve(overrides.webDir)
    : resolveDefaultWebDir();

  return {
    port:
      overrides.port ??
      Number(process.env.PORT || process.env.FIRO_PORT || 8080),
    host: overrides.host ?? process.env.HOST ?? "0.0.0.0",
    dataDir,
    dbPath,
    webDir,
    sessionTtlMs: overrides.sessionTtlMs ?? 30 * 24 * 60 * 60 * 1000, // 30 days
    authRateLimitMax: overrides.authRateLimitMax ?? 20, // 20 requests per window
    authRateLimitWindowMs: overrides.authRateLimitWindowMs ?? 60 * 1000, // 1 minute
    allowOpenRegistration:
      overrides.allowOpenRegistration ??
      process.env.FIRO_OPEN_REGISTRATION !== "false",
  };
}
