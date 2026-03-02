import { Hono } from "hono";
import { getConfig } from "./config.ts";
import { initDatabase } from "./db/index.ts";
import { createHttpApp } from "./http/index.ts";
import { createMcpServer } from "./mcp/index.ts";
import { startTrafficSync, cleanupOldTrafficLogs } from "./services/traffic.ts";
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

// MCP 会话管理：每个客户端连接独立的 McpServer + Transport（带 TTL）
interface ManagedSession {
  transport: StreamableHTTPTransport;
  lastAccess: number;
}
const SESSION_TTL = 30 * 60 * 1000; // 30 分钟无活动自动清理
const sessions = new Map<string, ManagedSession>();

app.all("/mcp", async (c) => {
  const sessionId = c.req.header("mcp-session-id");

  // 已有会话：路由到对应 transport
  if (sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      return c.json(
        { jsonrpc: "2.0", error: { code: -32000, message: "Session not found" }, id: null },
        404,
      );
    }
    session.lastAccess = Date.now();
    return session.transport.handleRequest(c);
  }

  // 新连接：创建独立的 McpServer + Transport
  const mcpServer = createMcpServer(db, config.baseUrl);
  const transport = new StreamableHTTPTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (id: string) => {
      sessions.set(id, { transport, lastAccess: Date.now() });
    },
    onsessionclosed: (id: string) => {
      sessions.delete(id);
    },
  });
  await mcpServer.connect(transport);
  return transport.handleRequest(c);
});

// 定期清理过期 MCP 会话
const sessionCleanup = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastAccess > SESSION_TTL) {
      sessions.delete(id);
    }
  }
}, 60_000);

// 启动流量同步
const syncTimer = startTrafficSync(db, config.trafficSyncInterval);

// 启动流量日志清理（每天一次，保留 90 天）
cleanupOldTrafficLogs(db);
const retentionTimer = setInterval(() => cleanupOldTrafficLogs(db), 24 * 60 * 60 * 1000);

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
function shutdown() {
  console.log("Shutting down...");
  clearInterval(syncTimer);
  clearInterval(retentionTimer);
  clearInterval(sessionCleanup);
  server.stop();
  db.$client.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
