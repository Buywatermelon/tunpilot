import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "../../db/index";
import {
  createUser,
  listUsers,
  getUser,
  updateUser,
  deleteUser,
  resetTraffic,
  assignNodesToUser,
  getUserNodes,
} from "../../services/user";

// 注册用户管理工具（7 个）：list_users, create_user, update_user, delete_user, reset_traffic, assign_nodes, list_user_nodes
export function register(server: McpServer, db: Db, _baseUrl: string) {
  server.tool(
    "list_users",
    "List all users and their status",
    {},
    async () => {
      const users = listUsers(db);
      return { content: [{ type: "text", text: JSON.stringify(users) }] };
    }
  );

  server.tool(
    "create_user",
    "Create a new user. IMPORTANT: Before calling this tool, you MUST confirm ALL optional parameters with the user. Present a summary table showing: username, password, quota (default: unlimited), max devices (default: 3), expiry (default: never), and which nodes to assign. Only proceed after explicit user confirmation.",
    {
      name: z.string().describe("Unique username"),
      password: z.string().describe("Hysteria2 auth password"),
      quota_bytes: z.number().optional().describe("Traffic quota in bytes (0 = unlimited)"),
      expires_at: z.string().optional().describe("Expiry datetime (null = never)"),
      max_devices: z.number().optional().describe("Max concurrent devices (default: 3)"),
    },
    async (args) => {
      const user = createUser(db, args);
      return { content: [{ type: "text", text: JSON.stringify(user) }] };
    }
  );

  server.tool(
    "update_user",
    "Update user configuration (partial update)",
    {
      id: z.string().describe("User ID"),
      password: z.string().optional().describe("Hysteria2 auth password"),
      quota_bytes: z.number().optional().describe("Traffic quota in bytes"),
      expires_at: z.string().optional().describe("Expiry datetime"),
      max_devices: z.number().optional().describe("Max concurrent devices"),
      enabled: z.number().optional().describe("1 = enabled, 0 = disabled"),
    },
    async ({ id, ...updates }) => {
      const user = updateUser(db, id, updates);
      if (!user) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "User not found" }) }],
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(user) }] };
    }
  );

  server.tool(
    "delete_user",
    "Delete a user (cascades to subscriptions and user_nodes)",
    { id: z.string().describe("User ID") },
    async ({ id }) => {
      deleteUser(db, id);
      return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
    }
  );

  server.tool(
    "reset_traffic",
    "Reset a user's used_bytes to 0",
    { id: z.string().describe("User ID") },
    async ({ id }) => {
      resetTraffic(db, id);
      return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
    }
  );

  server.tool(
    "assign_nodes",
    "Assign nodes to a user (replaces existing assignments). Required for user to connect via those nodes.",
    {
      user_id: z.string().describe("User ID"),
      node_ids: z.array(z.string()).describe("List of node IDs to assign"),
    },
    async ({ user_id, node_ids }) => {
      const user = getUser(db, user_id);
      if (!user) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "User not found" }) }],
        };
      }
      assignNodesToUser(db, user_id, node_ids);
      const assigned = getUserNodes(db, user_id);
      return {
        content: [{ type: "text", text: JSON.stringify({ user_id, nodes: assigned.map(n => ({ id: n.id, name: n.name })) }) }],
      };
    }
  );

  server.tool(
    "list_user_nodes",
    "List nodes assigned to a user",
    { user_id: z.string().describe("User ID") },
    async ({ user_id }) => {
      const nodes = getUserNodes(db, user_id);
      return {
        content: [{ type: "text", text: JSON.stringify(nodes.map(n => ({ id: n.id, name: n.name, host: n.host, port: n.port, enabled: n.enabled }))) }],
      };
    }
  );
}
