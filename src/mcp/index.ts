import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "../db/index";
import { register as registerNodes } from "./tools/nodes";
import { register as registerUsers } from "./tools/users";
import { register as registerSubscriptions } from "./tools/subscriptions";
import { register as registerMonitoring } from "./tools/monitoring";

export function createMcpServer(db: Db, baseUrl: string): McpServer {
  const server = new McpServer({
    name: "tunpilot",
    version: "0.1.0",
  });

  registerNodes(server, db, baseUrl);
  registerUsers(server, db, baseUrl);
  registerSubscriptions(server, db, baseUrl);
  registerMonitoring(server, db, baseUrl);

  return server;
}
