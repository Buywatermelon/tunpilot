export interface Config {
  port: number;
  host: string;
  dbPath: string;
  baseUrl: string;
  mcpAuthToken: string;
  trafficSyncInterval: number;
  sessionTtl: number;
  sessionCleanupInterval: number;
  reconcileInterval: number;
  retentionDays: number;
}

export function getConfig(): Config {
  return {
    port: Number(process.env.TUNPILOT_PORT) || 3000,
    host: process.env.TUNPILOT_HOST || "0.0.0.0",
    dbPath: process.env.TUNPILOT_DB_PATH || "./data/tunpilot.db",
    baseUrl: process.env.TUNPILOT_BASE_URL || "http://localhost:3000",
    mcpAuthToken: process.env.MCP_AUTH_TOKEN || "",
    trafficSyncInterval: Number(process.env.TRAFFIC_SYNC_INTERVAL) || 300_000,
    sessionTtl: Number(process.env.SESSION_TTL) || 30 * 60 * 1000,
    sessionCleanupInterval: Number(process.env.SESSION_CLEANUP_INTERVAL) || 60_000,
    reconcileInterval: Number(process.env.RECONCILE_INTERVAL) || 600_000,
    retentionDays: Number(process.env.TRAFFIC_RETENTION_DAYS) || 90,
  };
}
