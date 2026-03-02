import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "../../db/index";
import { listNodes } from "../../services/node";
import { eq, and, sql } from "drizzle-orm";
import { trafficLogs } from "../../db/schema";

// 注册监控工具（3 个）：check_health, get_traffic_stats, get_cert_status
export function register(server: McpServer, db: Db, _baseUrl: string) {
  server.tool(
    "check_health",
    "Check health status of all nodes",
    {},
    async () => {
      const nodes = listNodes(db);
      const results = nodes.map((node) => ({
        id: node.id,
        name: node.name,
        host: node.host,
        port: node.port,
        enabled: node.enabled,
        status: node.enabled ? "registered" : "disabled",
      }));

      return {
        content: [{ type: "text", text: JSON.stringify({ nodes: results }) }],
      };
    }
  );

  server.tool(
    "get_traffic_stats",
    "Query traffic statistics from local traffic_logs",
    {
      user_id: z.string().optional().describe("Filter by user ID"),
      node_id: z.string().optional().describe("Filter by node ID"),
    },
    async ({ user_id, node_id }) => {
      const conditions = [];
      if (user_id) conditions.push(eq(trafficLogs.user_id, user_id));
      if (node_id) conditions.push(eq(trafficLogs.node_id, node_id));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const row = db
        .select({
          total_tx: sql<number>`COALESCE(SUM(${trafficLogs.tx_bytes}), 0)`,
          total_rx: sql<number>`COALESCE(SUM(${trafficLogs.rx_bytes}), 0)`,
        })
        .from(trafficLogs)
        .where(where)
        .get()!;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              total_tx: row.total_tx,
              total_rx: row.total_rx,
              total_bytes: row.total_tx + row.total_rx,
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "get_cert_status",
    "Get certificate expiry status for all nodes",
    {},
    async () => {
      const certs = listNodes(db).map((node) => ({
        id: node.id,
        name: node.name,
        host: node.host,
        cert_path: node.cert_path,
        cert_expires: node.cert_expires,
        enabled: node.enabled,
      }));
      return { content: [{ type: "text", text: JSON.stringify(certs) }] };
    }
  );
}
