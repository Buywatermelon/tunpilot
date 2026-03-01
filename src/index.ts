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

// Ensure data directory exists
mkdirSync(dirname(config.dbPath), { recursive: true });

// Initialize database
const db = initDatabase(config.dbPath);

// Create HTTP app with all routes
const httpApp = createHttpApp(db, config.baseUrl);

// Create MCP server
const mcpServer = createMcpServer(db, config.baseUrl);

// Create main Hono app
const app = new Hono();

// Mount HTTP routes
app.route("/", httpApp);

// MCP endpoint with Bearer token auth
if (config.mcpAuthToken) {
  app.use("/mcp", bearerAuth({ token: config.mcpAuthToken }));
}

// Mount MCP on /mcp using StreamableHTTPTransport
const transport = new StreamableHTTPTransport({ sessionIdGenerator: () => crypto.randomUUID() });
mcpServer.connect(transport);

app.all("/mcp", async (c) => {
  const response = await transport.handleRequest(c);
  return response ?? c.text("", 405);
});

// Start traffic sync
const syncTimer = startTrafficSync(db, config.trafficSyncInterval);

// Start server
const server = Bun.serve({
  port: config.port,
  hostname: config.host,
  fetch: app.fetch,
});

console.log(`TunPilot running on ${config.host}:${config.port}`);
console.log(`  HTTP endpoints: /health, /auth/:nodeId/:authSecret, /sub/:token`);
console.log(`  MCP endpoint: /mcp`);
console.log(`  Traffic sync interval: ${config.trafficSyncInterval / 1000}s`);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down...");
  clearInterval(syncTimer);
  server.stop();
  db.close();
  process.exit(0);
});
