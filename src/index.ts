import { Hono } from "hono";
import { getConfig } from "./config.ts";
import { initDatabase } from "./db/index.ts";
import { createHttpApp } from "./http/index.ts";
import { createMcpServer } from "./mcp/index.ts";
import { startTrafficSync } from "./services/traffic.ts";
import {
  StreamableHTTPTransport,
  bearerAuth,
} from "@hono/mcp";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const config = getConfig();

// 确保数据目录存在
mkdirSync(dirname(config.dbPath), { recursive: true });

// 初始化数据库
const db = initDatabase(config.dbPath);

// 创建 HTTP 应用
const httpApp = createHttpApp(db, config.baseUrl);

// 创建 MCP 服务器
const mcpServer = createMcpServer(db, config.baseUrl);

// 创建主 Hono 应用
const app = new Hono();

// 挂载 HTTP 路由
app.route("/", httpApp);

// MCP 端点 Bearer Token 认证
if (config.mcpAuthToken) {
  app.use("/mcp", bearerAuth({ token: config.mcpAuthToken }));
}

// 挂载 MCP（使用 StreamableHTTPTransport）
const transport = new StreamableHTTPTransport({ sessionIdGenerator: () => crypto.randomUUID() });
mcpServer.connect(transport);

app.all("/mcp", async (c) => {
  const response = await transport.handleRequest(c);
  return response ?? c.text("", 405);
});

// 启动流量同步
const syncTimer = startTrafficSync(db, config.trafficSyncInterval);

// 启动服务器
const server = Bun.serve({
  port: config.port,
  hostname: config.host,
  fetch: app.fetch,
});

console.log(`TunPilot running on ${config.host}:${config.port}`);
console.log(`  HTTP endpoints: /health, /auth/:nodeId/:authSecret, /sub/:token`);
console.log(`  MCP endpoint: /mcp`);
console.log(`  Traffic sync interval: ${config.trafficSyncInterval / 1000}s`);

// 优雅关闭
process.on("SIGINT", () => {
  console.log("Shutting down...");
  clearInterval(syncTimer);
  server.stop();
  db.$client.close();
  process.exit(0);
});
