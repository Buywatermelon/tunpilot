import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "../../db/index";
import { RULE_SET_CATALOG } from "../../services/routing/catalog";
import {
  listRoutingRules,
  setRoutingRule,
  removeRoutingRule,
} from "../../services/routing/index";
import { nodes } from "../../db/schema";
import { eq } from "drizzle-orm";

// 注册分流规则工具（4 个）
export function register(server: McpServer, db: Db) {
  // 列出所有可用分类
  server.registerTool(
    "list_rule_sets",
    {
      description:
        "List all available rule set categories for traffic routing. Shows keys, names, and default actions.",
      inputSchema: {},
    },
    async () => {
      const sets = Object.entries(RULE_SET_CATALOG).map(
        ([key, def]) => ({
          key,
          name: def.name,
          defaultAction: def.defaultAction,
        }),
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(sets, null, 2),
          },
        ],
      };
    },
  );

  // 列出当前规则绑定
  server.registerTool(
    "list_routing_rules",
    {
      description:
        "List all current routing rule bindings. Shows which traffic categories are bound to which actions/nodes.",
      inputSchema: {},
    },
    async () => {
      const rules = listRoutingRules(db);
      const enriched = rules.map((r) => {
        const catalog = RULE_SET_CATALOG[r.rule_set_key];
        let actionDisplay = r.action;
        if (!["direct", "reject", "proxy"].includes(r.action)) {
          const node = db
            .select()
            .from(nodes)
            .where(eq(nodes.id, r.action))
            .get();
          actionDisplay = node ? `${node.name} (${r.action})` : `unknown-node (${r.action})`;
        }
        return {
          id: r.id,
          ruleSetKey: r.rule_set_key,
          ruleSetName: catalog?.name ?? r.rule_set_key,
          action: actionDisplay,
          strict: r.strict === 1,
          priority: r.priority,
          enabled: r.enabled === 1,
        };
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(enriched, null, 2),
          },
        ],
      };
    },
  );

  // 设置/更新规则绑定
  server.registerTool(
    "set_routing_rule",
    {
      description:
        'Create or update a routing rule. Maps a traffic category to an action. Action can be "direct", "reject", "proxy", or a node ID to route through a specific node. Set strict=true to prevent fallback (connection fails if node unavailable).',
      inputSchema: {
        rule_set_key: z
          .string()
          .describe(
            'Traffic category key (e.g. "openai", "netflix", "cn"). Use list_rule_sets to see available keys.',
          ),
        action: z
          .string()
          .describe(
            'Action: "direct", "reject", "proxy", or a node ID',
          ),
        strict: z
          .boolean()
          .optional()
          .describe(
            "If true, no fallback when bound node is unavailable (default: false)",
          ),
        priority: z
          .number()
          .optional()
          .describe(
            "Priority (higher = matched first). Default: 50",
          ),
      },
    },
    async ({ rule_set_key, action, strict, priority }) => {
      try {
        const rule = setRoutingRule(db, {
          ruleSetKey: rule_set_key,
          action,
          strict,
          priority,
        });
        const catalog = RULE_SET_CATALOG[rule_set_key];
        return {
          content: [
            {
              type: "text" as const,
              text: `Routing rule set: ${catalog?.name ?? rule_set_key} → ${action}${strict ? " (strict, no fallback)" : ""}\nID: ${rule.id}, Priority: ${rule.priority}`,
            },
          ],
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          isError: true,
        };
      }
    },
  );

  // 删除规则绑定
  server.registerTool(
    "remove_routing_rule",
    {
      description:
        "Remove a routing rule binding by its ID. The catch-all rule cannot be removed.",
      inputSchema: {
        id: z
          .string()
          .describe(
            'Rule ID to remove (e.g. "ads-reject", "openai-node"). Use list_routing_rules to see IDs.',
          ),
      },
    },
    async ({ id }) => {
      try {
        removeRoutingRule(db, id);
        return {
          content: [
            {
              type: "text" as const,
              text: `Routing rule "${id}" removed.`,
            },
          ],
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          isError: true,
        };
      }
    },
  );
}
