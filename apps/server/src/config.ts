import path from "node:path";

export interface ServerConfig {
  port: number;
  host: string;
  dataDir: string;
  dbPath: string;
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

  return {
    port:
      overrides.port ??
      Number(process.env.PORT || process.env.FIRO_PORT || 8080),
    host: overrides.host ?? process.env.HOST ?? "0.0.0.0",
    dataDir,
    dbPath,
    sessionTtlMs: overrides.sessionTtlMs ?? 30 * 24 * 60 * 60 * 1000, // 30 days
    authRateLimitMax: overrides.authRateLimitMax ?? 20, // 20 requests per window
    authRateLimitWindowMs: overrides.authRateLimitWindowMs ?? 60 * 1000, // 1 minute
    allowOpenRegistration:
      overrides.allowOpenRegistration ??
      process.env.FIRO_OPEN_REGISTRATION !== "false",
  };
}
