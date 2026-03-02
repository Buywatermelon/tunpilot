import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "../../db/index";
import { addNode, listNodes, getNode, updateNode, removeNode } from "../../services/node";

export function register(server: McpServer, db: Db, baseUrl: string) {
  server.tool(
    "list_nodes",
    "List all proxy nodes and their status",
    {},
    async () => {
      const nodes = listNodes(db);
      return { content: [{ type: "text", text: JSON.stringify(nodes) }] };
    }
  );

  server.tool(
    "get_node_info",
    "Get detailed info for a single node",
    { id: z.string().describe("Node ID") },
    async ({ id }) => {
      const node = getNode(db, id);
      if (!node) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "Node not found" }) }],
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(node) }] };
    }
  );

  server.tool(
    "add_node",
    "Register a new proxy node (auto-generates auth_secret)",
    {
      name: z.string().describe("Display name"),
      host: z.string().describe("Node address (domain or IP)"),
      port: z.number().describe("Hysteria2 proxy port"),
      protocol: z.string().describe("Protocol type, e.g. hysteria2"),
      stats_port: z.number().optional().describe("Traffic stats API port"),
      stats_secret: z.string().optional().describe("Traffic stats API secret"),
      sni: z.string().optional().describe("TLS SNI for subscription generation"),
      cert_path: z.string().optional().describe("Certificate file path on node"),
      cert_expires: z.string().optional().describe("Certificate expiry datetime"),
      hy2_version: z.string().optional().describe("Hysteria2 version"),
      config_path: z.string().optional().describe("Config file path on node"),
      ssh_user: z.string().optional().describe("SSH username for node ops"),
      ssh_port: z.number().optional().describe("SSH port"),
    },
    async (args) => {
      const node = addNode(db, args);
      const auth_callback_url = `${baseUrl}/auth/${node.id}/${node.auth_secret}`;
      return {
        content: [{ type: "text", text: JSON.stringify({ node, auth_callback_url }) }],
      };
    }
  );

  server.tool(
    "update_node",
    "Update node configuration (partial update)",
    {
      id: z.string().describe("Node ID"),
      name: z.string().optional().describe("Display name"),
      host: z.string().optional().describe("Node address"),
      port: z.number().optional().describe("Proxy port"),
      protocol: z.string().optional().describe("Protocol type"),
      stats_port: z.number().optional().describe("Stats API port"),
      stats_secret: z.string().optional().describe("Stats API secret"),
      sni: z.string().optional().describe("TLS SNI"),
      cert_path: z.string().optional().describe("Certificate path"),
      cert_expires: z.string().optional().describe("Certificate expiry"),
      hy2_version: z.string().optional().describe("Hysteria2 version"),
      config_path: z.string().optional().describe("Config path"),
      ssh_user: z.string().optional().describe("SSH username"),
      ssh_port: z.number().optional().describe("SSH port"),
      enabled: z.number().optional().describe("1 = enabled, 0 = disabled"),
    },
    async ({ id, ...updates }) => {
      const node = updateNode(db, id, updates);
      if (!node) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "Node not found" }) }],
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(node) }] };
    }
  );

  server.tool(
    "remove_node",
    "Delete a node (cascades to user_nodes)",
    { id: z.string().describe("Node ID") },
    async ({ id }) => {
      removeNode(db, id);
      return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
    }
  );
}
