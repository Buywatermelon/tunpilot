// 分流规则 CRUD service 函数

import { eq, desc } from "drizzle-orm";
import type { Db } from "../../db/index";
import { routingRules, nodes, type RoutingRule } from "../../db/schema";
import { RULE_SET_CATALOG } from "./catalog";

export {
  getActiveCustomRules,
  listCustomRules,
  addCustomRule,
  removeCustomRule,
  getCustomRule,
  updateCustomRule,
} from "./custom-rules";

/** 获取所有生效的规则（按 priority DESC） */
export function getActiveRules(db: Db): RoutingRule[] {
  return db
    .select()
    .from(routingRules)
    .where(eq(routingRules.enabled, 1))
    .orderBy(desc(routingRules.priority))
    .all();
}

/** 列出所有规则（含禁用的） */
export function listRoutingRules(db: Db): RoutingRule[] {
  return db
    .select()
    .from(routingRules)
    .orderBy(desc(routingRules.priority))
    .all();
}

/** 设置/更新一条规则 */
export function setRoutingRule(
  db: Db,
  opts: {
    ruleSetKey: string;
    action: string;
    strict?: boolean;
    priority?: number;
  },
): RoutingRule {
  // 验证 rule_set_key
  if (!(opts.ruleSetKey in RULE_SET_CATALOG)) {
    throw new Error(`Unknown rule set key: ${opts.ruleSetKey}. Use list_rule_sets to see available keys.`);
  }

  // 验证 action
  const builtins = ["direct", "reject", "proxy"];
  if (!builtins.includes(opts.action)) {
    const node = db.select().from(nodes).where(eq(nodes.id, opts.action)).get();
    if (!node) {
      throw new Error(`Node not found: ${opts.action}. Action must be "direct", "reject", "proxy", or a valid node ID.`);
    }
  }

  const id = `${opts.ruleSetKey}-${opts.action === "direct" ? "direct" : opts.action === "reject" ? "reject" : opts.action === "proxy" ? "proxy" : "node"}`;
  const catalogEntry = RULE_SET_CATALOG[opts.ruleSetKey];
  const priority = opts.priority ?? (catalogEntry.defaultAction === opts.action ? 50 : 50);

  return db
    .insert(routingRules)
    .values({
      id,
      rule_set_key: opts.ruleSetKey,
      action: opts.action,
      strict: opts.strict ? 1 : 0,
      priority,
      enabled: 1,
    })
    .onConflictDoUpdate({
      target: routingRules.id,
      set: {
        action: opts.action,
        strict: opts.strict ? 1 : 0,
        priority,
        enabled: 1,
      },
    })
    .returning()
    .get();
}

/** 删除一条规则 */
export function removeRoutingRule(db: Db, id: string): void {
  if (id === "catch-all") {
    throw new Error("Cannot remove the catch-all rule. It's required as the final fallback.");
  }
  db.delete(routingRules).where(eq(routingRules.id, id)).run();
}

/** 获取所有节点（用于 resolve 时查找 node_id → name） */
export function getAllNodes(db: Db) {
  return db.select().from(nodes).all();
}
