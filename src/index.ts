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

// 创建主 Hono 应用
const app = new Hono();

// 挂载 HTTP 路由
app.route("/", httpApp);

// MCP 端点 Bearer Token 认证
if (config.mcpAuthToken) {
  app.use("/mcp", bearerAuth({ token: config.mcpAuthToken }));
}

// MCP 会话管理：每个客户端连接独立的 McpServer + Transport
const sessions = new Map<string, StreamableHTTPTransport>();

app.all("/mcp", async (c) => {
  const sessionId = c.req.header("mcp-session-id");

  // 已有会话：路由到对应 transport
  if (sessionId) {
    const transport = sessions.get(sessionId);
    if (!transport) {
      return c.json(
        { jsonrpc: "2.0", error: { code: -32000, message: "Session not found" }, id: null },
        404,
      );
    }
    return transport.handleRequest(c);
  }

  // 新连接：创建独立的 McpServer + Transport
  const mcpServer = createMcpServer(db, config.baseUrl);
  const transport = new StreamableHTTPTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (id: string) => {
      sessions.set(id, transport);
    },
    onsessionclosed: (id: string) => {
      sessions.delete(id);
    },
  });
  await mcpServer.connect(transport);
  return transport.handleRequest(c);
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
