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
  /** Extra browser origins allowed to call the HTTP API with credentials. */
  allowedOrigins: string[];
  /**
   * Mark the session cookie Secure. Off by default so plain-HTTP homelab
   * LAN deployments keep working; enable behind HTTPS.
   */
  secureCookies: boolean;
  /**
   * Optional per-message WebSocket payload cap in bytes. Undefined leaves the
   * ws default (100 MiB) in effect.
   */
  wsMaxPayloadBytes: number | undefined;
}

const parseMaxPayloadBytes = (raw: string | undefined): number | undefined => {
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
};

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
    allowedOrigins:
      overrides.allowedOrigins ??
      (process.env.FIRO_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((o) => o.trim().replace(/\/+$/, ""))
        .filter(Boolean),
    secureCookies:
      overrides.secureCookies ?? process.env.FIRO_SECURE_COOKIES === "true",
    wsMaxPayloadBytes:
      overrides.wsMaxPayloadBytes ??
      parseMaxPayloadBytes(process.env.FIRO_WS_MAX_PAYLOAD),
  };
}
