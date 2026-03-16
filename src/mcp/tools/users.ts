import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "../../db/index";
import {
  createUser,
  listUsers,
  getUser,
  getUserNodes,
} from "../../services/user";
import {
  updateUserWithSync,
  deleteUserWithSync,
  resetTrafficWithSync,
  assignNodesWithSync,
  addNodeWithSync,
  removeNodeWithSync,
} from "../../services/user-ops";

// 注册用户管理工具（9 个）：list_users, create_user, update_user, delete_user, reset_traffic, assign_nodes, add_user_node, remove_user_node, list_user_nodes
export function register(server: McpServer, db: Db, _baseUrl: string) {
  server.registerTool(
    "list_users",
    {
      description: "List all users and their status",
      inputSchema: {},
    },
    async () => {
      const users = listUsers(db);
      return { content: [{ type: "text", text: JSON.stringify(users) }] };
    }
  );

  server.registerTool(
    "create_user",
    {
      description: "Create a new user. IMPORTANT: Before calling this tool, you MUST confirm ALL optional parameters with the user. Present a summary table showing: username, password, quota (default: unlimited), max devices (default: 3), expiry (default: never), and which nodes to assign. Only proceed after explicit user confirmation.",
      inputSchema: {
        name: z.string().describe("Unique username"),
        password: z.string().describe("Auth password (Hysteria2 / Trojan)"),
        quota_bytes: z.number().optional().describe("Traffic quota in bytes (0 = unlimited)"),
        expires_at: z.string().optional().describe("Expiry datetime (null = never)"),
        max_devices: z.number().optional().describe("Max concurrent devices (default: 3)"),
      },
    },
    async (args) => {
      const user = createUser(db, args);
      return { content: [{ type: "text", text: JSON.stringify(user) }] };
    }
  );

  server.registerTool(
    "update_user",
    {
      description: "Update user configuration (partial update)",
      inputSchema: {
        id: z.string().describe("User ID"),
        password: z.string().optional().describe("Hysteria2 auth password"),
        quota_bytes: z.number().optional().describe("Traffic quota in bytes"),
        expires_at: z.string().optional().describe("Expiry datetime"),
        max_devices: z.number().optional().describe("Max concurrent devices"),
        enabled: z.number().optional().describe("1 = enabled, 0 = disabled"),
      },
    },
    async ({ id, ...updates }) => {
      const user = await updateUserWithSync(db, id, updates);
      if (!user) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "User not found" }) }],
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(user) }] };
    }
  );

  server.registerTool(
    "delete_user",
    {
      description: "Delete a user (cascades to subscriptions and user_nodes)",
      inputSchema: { id: z.string().describe("User ID") },
    },
    async ({ id }) => {
      await deleteUserWithSync(db, id);
      return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
    }
  );

  server.registerTool(
    "reset_traffic",
    {
      description: "Reset a user's used_bytes to 0",
      inputSchema: { id: z.string().describe("User ID") },
    },
    async ({ id }) => {
      await resetTrafficWithSync(db, id);
      return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
    }
  );

  server.registerTool(
    "assign_nodes",
    {
      description: "Set the FULL list of nodes for a user (replaces ALL existing assignments). ⚠️ This is a REPLACE operation — any previously assigned nodes NOT in the list will be REMOVED. To add/remove a single node without affecting others, use add_user_node / remove_user_node instead.",
      inputSchema: {
        user_id: z.string().describe("User ID"),
        node_ids: z.array(z.string()).describe("Complete list of node IDs — replaces all current assignments"),
      },
    },
    async ({ user_id, node_ids }) => {
      const user = getUser(db, user_id);
      if (!user) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "User not found" }) }],
        };
      }
      await assignNodesWithSync(db, user_id, node_ids);
      const assigned = getUserNodes(db, user_id);
      return {
        content: [{ type: "text", text: JSON.stringify({ user_id, nodes: assigned.map(n => ({ id: n.id, name: n.name })) }) }],
      };
    }
  );

  server.registerTool(
    "add_user_node",
    {
      description: "Add a single node to a user's access list (incremental — does not affect other assigned nodes). Idempotent: returns success even if already assigned.",
      inputSchema: {
        user_id: z.string().describe("User ID"),
        node_id: z.string().describe("Node ID to add"),
      },
    },
    async ({ user_id, node_id }) => {
      const user = getUser(db, user_id);
      if (!user) {
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "User not found" }) }] };
      }
      const { added, errors } = await addNodeWithSync(db, user_id, node_id);
      const assigned = getUserNodes(db, user_id);
      return {
        content: [{ type: "text", text: JSON.stringify({
          user_id,
          node_id,
          added,
          total_nodes: assigned.length,
          sync_errors: errors,
        }) }],
      };
    }
  );

  server.registerTool(
    "remove_user_node",
    {
      description: "Remove a single node from a user's access list (incremental — does not affect other assigned nodes).",
      inputSchema: {
        user_id: z.string().describe("User ID"),
        node_id: z.string().describe("Node ID to remove"),
      },
    },
    async ({ user_id, node_id }) => {
      const user = getUser(db, user_id);
      if (!user) {
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "User not found" }) }] };
      }
      const { removed, errors } = await removeNodeWithSync(db, user_id, node_id);
      const assigned = getUserNodes(db, user_id);
      return {
        content: [{ type: "text", text: JSON.stringify({
          user_id,
          node_id,
          removed,
          total_nodes: assigned.length,
          sync_errors: errors,
        }) }],
      };
    }
  );

  server.registerTool(
    "list_user_nodes",
    {
      description: "List nodes assigned to a user",
      inputSchema: { user_id: z.string().describe("User ID") },
    },
    async ({ user_id }) => {
      const nodes = getUserNodes(db, user_id);
      return {
        content: [{ type: "text", text: JSON.stringify(nodes.map(n => ({ id: n.id, name: n.name, host: n.host, port: n.port, enabled: n.enabled }))) }],
      };
    }
  );
}
