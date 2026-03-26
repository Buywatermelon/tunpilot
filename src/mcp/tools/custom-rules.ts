import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "../../db/index";
import {
  listCustomRules,
  addCustomRule,
  removeCustomRule,
} from "../../services/routing/custom-rules";

// 注册自定义分流规则工具（3 个）
export function register(server: McpServer, db: Db) {
  server.registerTool(
    "add_custom_rule",
    {
      description:
        'Add a custom routing rule for a specific domain or IP. These rules have higher priority than category-based rules and are rendered inline in all subscription formats (singbox/clash/surge/shadowrocket).',
      inputSchema: {
        type: z
          .enum(["domain", "domain_suffix", "domain_keyword", "ip_cidr"])
          .describe(
            'Match type. "domain": exact domain, "domain_suffix": matches domain and all subdomains (e.g., "adspower.net" matches "start.adspower.net"), "domain_keyword": contains keyword, "ip_cidr": IP range (e.g., "192.168.1.0/24")',
          ),
        value: z
          .string()
          .describe(
            'The domain, keyword, or IP CIDR to match (e.g., "adspower.net", "192.168.1.0/24")',
          ),
        action: z
          .enum(["direct", "reject", "proxy"])
          .describe(
            'Action to take: "direct" (bypass proxy), "reject" (block), "proxy" (use proxy)',
          ),
        priority: z
          .number()
          .optional()
          .describe(
            "Priority (higher = matched first). Default: 100",
          ),
        description: z
          .string()
          .optional()
          .describe(
            'Human-readable note (e.g., "AdsPower fingerprint browser")',
          ),
      },
    },
    async ({ type, value, action, priority, description }) => {
      try {
        const rule = addCustomRule(db, {
          type,
          value,
          action,
          priority,
          description,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Custom rule added: ${rule.type.toUpperCase()} ${rule.value} → ${rule.action}${rule.description ? ` (${rule.description})` : ""}\nID: ${rule.id}, Priority: ${rule.priority}`,
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

  server.registerTool(
    "list_custom_rules",
    {
      description:
        "List all custom routing rules. These are user-defined domain/IP rules rendered inline in subscription configs.",
      inputSchema: {},
    },
    async () => {
      const rules = listCustomRules(db);
      const display = rules.map((r) => ({
        id: r.id,
        type: r.type,
        value: r.value,
        action: r.action,
        priority: r.priority,
        enabled: r.enabled === 1,
        description: r.description,
      }));
      return {
        content: [
          {
            type: "text" as const,
            text: rules.length > 0
              ? JSON.stringify(display, null, 2)
              : "No custom rules defined. Use add_custom_rule to create one.",
          },
        ],
      };
    },
  );

  server.registerTool(
    "remove_custom_rule",
    {
      description:
        "Remove a custom routing rule by its ID. Use list_custom_rules to see IDs.",
      inputSchema: {
        id: z
          .string()
          .describe("The ID of the custom rule to remove."),
      },
    },
    async ({ id }) => {
      try {
        removeCustomRule(db, id);
        return {
          content: [
            {
              type: "text" as const,
              text: `Custom rule "${id}" removed.`,
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
