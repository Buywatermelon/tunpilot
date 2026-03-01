import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { listNodes } from "../../services/node";

interface TrafficRow {
  total_tx: number;
  total_rx: number;
}

export function register(server: McpServer, db: Database, _baseUrl: string) {
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
      let query = "SELECT COALESCE(SUM(tx_bytes), 0) as total_tx, COALESCE(SUM(rx_bytes), 0) as total_rx FROM traffic_logs WHERE 1=1";
      const params: string[] = [];

      if (user_id) {
        query += " AND user_id = ?";
        params.push(user_id);
      }
      if (node_id) {
        query += " AND node_id = ?";
        params.push(node_id);
      }

      const row = db.query(query).get(...params) as TrafficRow;

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
}
