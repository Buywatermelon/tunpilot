// TunPilot 配置接口
export interface Config {
  port: number;           // 监听端口
  host: string;           // 监听地址
  dbPath: string;         // SQLite 数据库路径
  baseUrl: string;        // 外部可访问的基础 URL
  mcpAuthToken: string;   // MCP 端点 Bearer Token
  trafficSyncInterval: number; // 流量同步间隔（毫秒）
}

// 从环境变量读取配置，未设置时使用默认值
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
