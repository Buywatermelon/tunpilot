import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "../../db/index";
import { listNodes } from "../../services/node";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { trafficLogs } from "../../db/schema";
import { getXrayClient } from "../../services/xray/pool";
import { isCallAllowed } from "../../lib/circuit-breaker";

// 注册监控工具（2 个）：check_health, get_traffic_stats
export function register(server: McpServer, db: Db, _baseUrl: string) {
  server.registerTool(
    "check_health",
    {
      description: "Check health status of all nodes (pings stats API if configured)",
      inputSchema: {},
    },
    async () => {
      const nodes = listNodes(db);
      const settled = await Promise.allSettled(
        nodes.map(async (node) => {
          const base = {
            id: node.id,
            name: node.name,
            host: node.host,
            port: node.port,
            enabled: node.enabled,
          };

          if (!node.enabled) return { ...base, status: "disabled" as const };

          // Circuit breaker check — skip nodes with open circuits
          const trafficKey = `traffic:${node.id}`;
          const xrayKey = `xray:${node.id}`;
          if (!isCallAllowed(trafficKey) || !isCallAllowed(xrayKey)) {
            return { ...base, status: "circuit_open" as const };
          }

          // 如果配置了 stats_port，实际 ping 节点
          if (node.stats_port) {
            try {
              if (node.protocol === "trojan") {
                // Xray/Trojan: gRPC health check via QueryStats
                const client = await getXrayClient(node);
                if (client) {
                  await client.queryTraffic(false);
                  return { ...base, status: "online" as const };
                }
              } else if (node.stats_secret) {
                // Hysteria2: HTTP stats API ping
                const res = await fetch(
                  `http://${node.host}:${node.stats_port}/traffic`,
                  {
                    headers: { Authorization: node.stats_secret },
                    signal: AbortSignal.timeout(5_000),
                  },
                );
                return { ...base, status: res.ok ? "online" as const : `error_${res.status}` };
              }
            } catch (err: any) {
              console.error(JSON.stringify({
                event: "health_check_failed",
                nodeId: node.id,
                error: err.message,
              }));
              return { ...base, status: "unreachable" as const };
            }
          }

          return { ...base, status: "registered" as const };
        }),
      );

      const results = settled.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : { id: nodes[i]!.id, name: nodes[i]!.name, status: "error" as const },
      );

      return {
        content: [{ type: "text", text: JSON.stringify({ nodes: results }) }],
      };
    },
  );

  server.registerTool(
    "get_traffic_stats",
    {
      description: "Query traffic statistics from local traffic_logs",
      inputSchema: {
        user_id: z.string().optional().describe("Filter by user ID"),
        node_id: z.string().optional().describe("Filter by node ID"),
        from: z.string().optional().describe("Start datetime (inclusive), e.g. 2026-03-01"),
        to: z.string().optional().describe("End datetime (exclusive), e.g. 2026-04-01"),
      },
    },
    async ({ user_id, node_id, from, to }) => {
      const conditions = [];
      if (user_id) conditions.push(eq(trafficLogs.user_id, user_id));
      if (node_id) conditions.push(eq(trafficLogs.node_id, node_id));
      if (from) conditions.push(gte(trafficLogs.recorded_at, from));
      if (to) conditions.push(lt(trafficLogs.recorded_at, to));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const row = db
        .select({
          total_tx: sql<number>`COALESCE(SUM(${trafficLogs.tx_bytes}), 0)`,
          total_rx: sql<number>`COALESCE(SUM(${trafficLogs.rx_bytes}), 0)`,
        })
        .from(trafficLogs)
        .where(where)
        .get();

      const total_tx = row?.total_tx ?? 0;
      const total_rx = row?.total_rx ?? 0;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              total_tx,
              total_rx,
              total_bytes: total_tx + total_rx,
            }),
          },
        ],
      };
    },
  );

}
