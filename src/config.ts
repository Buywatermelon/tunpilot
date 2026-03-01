export interface Config {
  port: number;
  host: string;
  dbPath: string;
  baseUrl: string;
  mcpAuthToken: string;
  trafficSyncInterval: number;
}

export function getConfig(): Config {
  return {
    port: Number(process.env.TUNPILOT_PORT) || 3000,
    host: process.env.TUNPILOT_HOST || "0.0.0.0",
    dbPath: process.env.TUNPILOT_DB_PATH || "./data/tunpilot.db",
    baseUrl: process.env.TUNPILOT_BASE_URL || "http://localhost:3000",
    mcpAuthToken: process.env.MCP_AUTH_TOKEN || "",
    trafficSyncInterval: Number(process.env.TRAFFIC_SYNC_INTERVAL) || 300000,
  };
}
