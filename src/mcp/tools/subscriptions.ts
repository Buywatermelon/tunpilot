import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "../../db/index";
import { getUser, getUserNodes } from "../../services/user";
import {
  generateSubscription,
  listSubscriptions,
  getSubscriptionByToken,
} from "../../services/subscription";

export function register(server: McpServer, db: Db, baseUrl: string) {
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

      const sub = generateSubscription(db, user_id, format, baseUrl);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id: sub.id,
              user_id: sub.user_id,
              token: sub.token,
              format: sub.format,
              subscription_url: sub.url,
            }),
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
      const subs = listSubscriptions(db, user_id);
      return { content: [{ type: "text", text: JSON.stringify(subs) }] };
    }
  );

  server.tool(
    "get_subscription_config",
    "Preview subscription config content (for debugging)",
    { token: z.string().describe("Subscription token") },
    async ({ token }) => {
      const sub = getSubscriptionByToken(db, token);

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
