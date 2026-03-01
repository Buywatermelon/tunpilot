import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { getUser, getUserNodes } from "../../services/user";

interface Subscription {
  id: string;
  user_id: string;
  token: string;
  format: string;
  created_at: string;
}

export function register(server: McpServer, db: Database, baseUrl: string) {
  server.tool(
    "generate_subscription",
    "Generate a subscription link for a user",
    {
      user_id: z.string().describe("User ID"),
      format: z
        .string()
        .describe('Subscription format: "shadowrocket", "singbox", or "clash"'),
    },
    async ({ user_id, format }) => {
      const user = getUser(db, user_id);
      if (!user) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "User not found" }) }],
        };
      }

      const id = crypto.randomUUID();
      const token = crypto.randomUUID();

      db.run(
        "INSERT INTO subscriptions (id, user_id, token, format) VALUES (?, ?, ?, ?)",
        [id, user_id, token, format]
      );

      const subscription_url = `${baseUrl}/sub/${token}`;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ id, user_id, token, format, subscription_url }),
          },
        ],
      };
    }
  );

  server.tool(
    "list_subscriptions",
    "List subscriptions for a user",
    { user_id: z.string().describe("User ID") },
    async ({ user_id }) => {
      const subs = db
        .query("SELECT * FROM subscriptions WHERE user_id = ?")
        .all(user_id) as Subscription[];
      return { content: [{ type: "text", text: JSON.stringify(subs) }] };
    }
  );

  server.tool(
    "get_subscription_config",
    "Preview subscription config content (for debugging)",
    { token: z.string().describe("Subscription token") },
    async ({ token }) => {
      const sub = db
        .query("SELECT * FROM subscriptions WHERE token = ?")
        .get(token) as Subscription | null;

      if (!sub) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "Subscription not found" }) }],
        };
      }

      const user = getUser(db, sub.user_id);
      if (!user) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "User not found" }) }],
        };
      }

      const nodes = getUserNodes(db, user.id).filter((n) => n.enabled);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              user: user.name,
              format: sub.format,
              nodes: nodes.map((n) => ({
                name: n.name,
                host: n.host,
                port: n.port,
                protocol: n.protocol,
                sni: n.sni,
              })),
            }),
          },
        ],
      };
    }
  );
}
