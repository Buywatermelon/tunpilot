// 自定义域名/IP 分流规则 CRUD

import { eq } from "drizzle-orm";
import type { Db } from "../../db/index";
import { customRules, type CustomRule } from "../../db/schema";

const VALID_TYPES = ["domain", "domain_suffix", "domain_keyword", "ip_cidr"] as const;
const VALID_ACTIONS = ["direct", "reject", "proxy"] as const;

/** 获取所有生效的自定义规则（按 priority DESC） */
export function getActiveCustomRules(db: Db): CustomRule[] {
  return db
    .select()
    .from(customRules)
    .where(eq(customRules.enabled, 1))
    .all()
    .sort((a, b) => (b.priority ?? 100) - (a.priority ?? 100));
}

/** 列出所有自定义规则（含禁用的） */
export function listCustomRules(db: Db): CustomRule[] {
  return db
    .select()
    .from(customRules)
    .all()
    .sort((a, b) => (b.priority ?? 100) - (a.priority ?? 100));
}

/** 添加一条自定义规则 */
export function addCustomRule(
  db: Db,
  opts: {
    type: string;
    value: string;
    action: string;
    priority?: number;
    description?: string;
  },
): CustomRule {
  if (!VALID_TYPES.includes(opts.type as typeof VALID_TYPES[number])) {
    throw new Error(
      `Invalid type: "${opts.type}". Must be one of: ${VALID_TYPES.join(", ")}`,
    );
  }

  if (!VALID_ACTIONS.includes(opts.action as typeof VALID_ACTIONS[number])) {
    throw new Error(
      `Invalid action: "${opts.action}". Must be one of: ${VALID_ACTIONS.join(", ")}`,
    );
  }

  const value = opts.value.trim().toLowerCase();
  if (!value) {
    throw new Error("Value cannot be empty.");
  }

  // ip_cidr 基本格式校验
  if (opts.type === "ip_cidr" && !value.includes("/")) {
    throw new Error("IP CIDR must include a prefix length (e.g., 192.168.1.0/24).");
  }

  return db
    .insert(customRules)
    .values({
      type: opts.type,
      value,
      action: opts.action,
      priority: opts.priority ?? 100,
      description: opts.description ?? null,
    })
    .returning()
    .get();
}

/** 删除一条自定义规则 */
export function removeCustomRule(db: Db, id: string): void {
  const rule = db.select().from(customRules).where(eq(customRules.id, id)).get();
  if (!rule) {
    throw new Error(`Custom rule not found: ${id}`);
  }
  db.delete(customRules).where(eq(customRules.id, id)).run();
}
