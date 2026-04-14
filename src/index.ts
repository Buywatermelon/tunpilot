import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { getConfig } from "./config.ts";
import { initDatabase } from "./db/index.ts";
import { createHttpApp } from "./http/index.ts";
import { createApiApp } from "./api/index.ts";
import { startTrafficSync, cleanupOldTrafficLogs } from "./services/traffic.ts";
import { reconcileAllXrayNodes } from "./services/xray/sync.ts";
import { reconcileAllHysteriaNodes } from "./services/hysteria/sync.ts";
import { closeAllXrayClients } from "./services/xray/pool.ts";
import { closeAllTunnels } from "./services/xray/tunnel.ts";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const config = getConfig();

// 确保数据目录存在
mkdirSync(dirname(config.dbPath), { recursive: true });

// 初始化数据库
const db = initDatabase(config.dbPath);

// 创建主 Hono 应用
const app = new Hono();

// 挂载 HTTP 路由（订阅、健康检查等）
app.route("/", createHttpApp(db, config.baseUrl));

// 挂载 REST API 路由
app.route("/api/v1", createApiApp(db, config.baseUrl));

// 静态文件服务（Web Admin）
app.use("/*", serveStatic({ root: "./web/dist" }));
app.get("/*", async (c) => {
  const html = Bun.file("./web/dist/index.html");
  if (await html.exists()) return c.html(await html.text());
  return c.text("Not found", 404);
});

// 启动流量同步
let syncTimer: ReturnType<typeof setInterval> | undefined;
if (config.trafficSyncInterval > 0) {
  syncTimer = startTrafficSync(db, config.trafficSyncInterval);
}

// 流量日志清理
cleanupOldTrafficLogs(db, config.retentionDays);
const retentionTimer = setInterval(() => cleanupOldTrafficLogs(db, config.retentionDays), 24 * 60 * 60 * 1000);

// 节点对账
let reconcileTimer: ReturnType<typeof setInterval> | undefined;
if (config.reconcileInterval > 0) {
  reconcileAllXrayNodes(db).catch((err) => {
    console.error("Initial Xray reconciliation failed:", err);
  });
  reconcileAllHysteriaNodes(db).catch((err) => {
    console.error("Initial Hysteria reconciliation failed:", err);
  });
  reconcileTimer = setInterval(() => {
    reconcileAllXrayNodes(db).catch((err) => {
      console.error("Xray reconciliation failed:", err);
    });
    reconcileAllHysteriaNodes(db).catch((err) => {
      console.error("Hysteria reconciliation failed:", err);
    });
  }, config.reconcileInterval);
}

// 启动服务器
const server = Bun.serve({
  port: config.port,
  hostname: config.host,
  idleTimeout: 30,
  fetch: app.fetch,
});

console.log(`TunPilot running on ${config.host}:${config.port}`);
console.log(`  HTTP endpoints: /health, /sub/:token`);
console.log(`  API endpoints: /api/v1/*`);
console.log(`  Traffic sync: ${config.trafficSyncInterval > 0 ? `${config.trafficSyncInterval / 1000}s` : "disabled"}`);
console.log(`  Reconcile: ${config.reconcileInterval > 0 ? `${config.reconcileInterval / 1000}s` : "disabled"}`);

// 优雅关闭
function shutdown() {
  console.log("Shutting down...");
  if (syncTimer) clearInterval(syncTimer);
  clearInterval(retentionTimer);
  if (reconcileTimer) clearInterval(reconcileTimer);
  closeAllXrayClients();
  closeAllTunnels();
  server.stop();
  db.$client.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
