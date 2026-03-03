import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "../../db/index";
import { getNode } from "../../services/node";
import { runProvider, runProvidersByCategory } from "../../services/diagnostics/index";

// Import all providers to trigger self-registration
import "../../services/diagnostics/providers/connectivity";
import "../../services/diagnostics/providers/ipinfo";
import "../../services/diagnostics/providers/scamalytics";
import "../../services/diagnostics/providers/ipqs";
import "../../services/diagnostics/providers/abuseipdb";
import "../../services/diagnostics/providers/globalping";

function resolveNode(db: Db, nodeId: string) {
  const node = getNode(db, nodeId);
  if (!node) return null;
  return node;
}

// 注册诊断工具（4 个）：check_node_ip, check_ip_quality, test_node_connectivity, test_node_route
export function register(server: McpServer, db: Db, _baseUrl: string) {
  server.registerTool(
    "check_node_ip",
    {
      description: "Query node IP information: geolocation, ASN, ISP, privacy detection (requires ipinfo_token setting)",
      inputSchema: {
        node_id: z.string().describe("Node ID to check"),
      },
    },
    async ({ node_id }) => {
      const node = resolveNode(db, node_id);
      if (!node) {
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "Node not found" }) }] };
      }
      const result = await runProvider(db, "ipinfo", { ip: node.host, port: node.port });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.registerTool(
    "check_ip_quality",
    {
      description: "Check IP quality/purity using Scamalytics, IPQS, and AbuseIPDB (runs all configured providers in parallel)",
      inputSchema: {
        node_id: z.string().describe("Node ID to check"),
      },
    },
    async ({ node_id }) => {
      const node = resolveNode(db, node_id);
      if (!node) {
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "Node not found" }) }] };
      }
      const results = await runProvidersByCategory(db, "ip_quality", { ip: node.host });
      return { content: [{ type: "text", text: JSON.stringify({ node_id, ip: node.host, results }) }] };
    }
  );

  server.registerTool(
    "test_node_connectivity",
    {
      description: "Test node connectivity with TCP handshake and measure latency",
      inputSchema: {
        node_id: z.string().describe("Node ID to test"),
      },
    },
    async ({ node_id }) => {
      const node = resolveNode(db, node_id);
      if (!node) {
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "Node not found" }) }] };
      }
      const result = await runProvider(db, "connectivity", { ip: node.host, port: node.port });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.registerTool(
    "test_node_route",
    {
      description: "Test network route from a specified location to the node using Globalping (requires globalping_token setting)",
      inputSchema: {
        node_id: z.string().describe("Node ID to test"),
        from: z.string().optional().describe('Source location, e.g. "Beijing, CN" or "Tokyo, JP". Default: "Beijing, CN"'),
      },
    },
    async ({ node_id, from }) => {
      const node = resolveNode(db, node_id);
      if (!node) {
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "Node not found" }) }] };
      }
      const result = await runProvider(db, "globalping", {
        ip: node.host,
        target: from || "Beijing, CN",
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );
}
