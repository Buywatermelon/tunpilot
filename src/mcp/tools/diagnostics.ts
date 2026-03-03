import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "../../db/index";
import { getNode } from "../../services/node";
import { runIPQuality } from "../../services/ipquality";
import { runNetQuality, type NetQualityMode } from "../../services/netquality";

// 注册诊断工具（2 个）：test_node_ipquality, test_node_netquality
export function register(server: McpServer, db: Db, _baseUrl: string) {
  server.registerTool(
    "test_node_ipquality",
    {
      description:
        "Run comprehensive IP quality check on a node via SSH. Queries 10 IP risk databases (IPinfo, Scamalytics, IPQS, AbuseIPDB, etc.), checks streaming media unlock, and email blacklists. Requires ssh_user configured on the node. Takes ~60-120s.",
      inputSchema: {
        node_id: z.string().describe("Node ID to test"),
      },
    },
    async ({ node_id }) => {
      const node = getNode(db, node_id);
      if (!node) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Node not found" }) }],
        };
      }

      if (!node.ssh_user) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Node does not have ssh_user configured. Update the node with ssh_user to use this tool.",
              }),
            },
          ],
        };
      }

      try {
        const result = await runIPQuality(node.host, node.ssh_user, node.ssh_port ?? 22);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ node_id, node_name: node.name, host: node.host, ...result }),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `IPQuality check failed: ${err instanceof Error ? err.message : String(err)}`,
              }),
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "test_node_netquality",
    {
      description:
        "Run comprehensive network quality test on a node via SSH. Tests BGP info, NAT type, Tier-1 connectivity, three-network TCP latency (31 provinces × CT/CU/CM), domestic speedtest, and international interconnection (10 global cities). Requires ssh_user configured. Full mode takes 3-5 min.",
      inputSchema: {
        node_id: z.string().describe("Node ID to test"),
        mode: z
          .enum(["full", "ping", "low"])
          .default("full")
          .describe("Test mode: full (all 7 modules, 3-5 min), ping (latency only, ~30s), low (skip speedtest)"),
      },
    },
    async ({ node_id, mode }) => {
      const node = getNode(db, node_id);
      if (!node) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Node not found" }) }],
        };
      }

      if (!node.ssh_user) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Node does not have ssh_user configured. Update the node with ssh_user to use this tool.",
              }),
            },
          ],
        };
      }

      try {
        const result = await runNetQuality(node.host, node.ssh_user, node.ssh_port ?? 22, mode as NetQualityMode);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ node_id, node_name: node.name, host: node.host, mode, ...result }),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `NetQuality check failed: ${err instanceof Error ? err.message : String(err)}`,
              }),
            },
          ],
        };
      }
    },
  );
}
