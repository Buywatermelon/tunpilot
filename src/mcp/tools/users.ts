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
} from "../../services/user";

// 注册用户管理工具（5 个）：list_users, create_user, update_user, delete_user, reset_traffic
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
    "Create a new user",
    {
      name: z.string().describe("Unique username"),
      password: z.string().describe("Hysteria2 auth password"),
      quota_bytes: z.number().optional().describe("Traffic quota in bytes (0 = unlimited)"),
      expires_at: z.string().optional().describe("Expiry datetime (null = never)"),
      max_devices: z.number().optional().describe("Max concurrent devices"),
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
      updateUser(db, id, updates);
      const user = getUser(db, id);
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
}
