// 自定义域名/IP 分流规则 CRUD

import { eq, desc, and } from "drizzle-orm";
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
    .orderBy(desc(customRules.priority))
    .all();
}

/** 列出所有自定义规则（含禁用的） */
export function listCustomRules(db: Db): CustomRule[] {
  return db
    .select()
    .from(customRules)
    .orderBy(desc(customRules.priority))
    .all();
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

  // 检查重复规则 (P4)
  const existing = db
    .select()
    .from(customRules)
    .where(and(eq(customRules.type, opts.type), eq(customRules.value, value)))
    .get();
  if (existing) {
    throw new Error(
      `Duplicate rule: ${opts.type} "${value}" already exists (id: ${existing.id}, action: ${existing.action}).`,
    );
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

/** 获取单条自定义规则 */
export function getCustomRule(db: Db, id: string): CustomRule | null {
  return db.select().from(customRules).where(eq(customRules.id, id)).get() ?? null;
}

/** 更新一条自定义规则 */
export function updateCustomRule(
  db: Db,
  id: string,
  opts: {
    type?: string;
    value?: string;
    action?: string;
    priority?: number;
    enabled?: boolean;
    description?: string | null;
  },
): CustomRule {
  const existing = db.select().from(customRules).where(eq(customRules.id, id)).get();
  if (!existing) {
    throw new Error(`Custom rule not found: ${id}`);
  }

  if (opts.type !== undefined && !VALID_TYPES.includes(opts.type as typeof VALID_TYPES[number])) {
    throw new Error(
      `Invalid type: "${opts.type}". Must be one of: ${VALID_TYPES.join(", ")}`,
    );
  }

  if (opts.action !== undefined && !VALID_ACTIONS.includes(opts.action as typeof VALID_ACTIONS[number])) {
    throw new Error(
      `Invalid action: "${opts.action}". Must be one of: ${VALID_ACTIONS.join(", ")}`,
    );
  }

  const updates: Record<string, unknown> = {};
  if (opts.type !== undefined) updates.type = opts.type;
  if (opts.action !== undefined) updates.action = opts.action;
  if (opts.priority !== undefined) updates.priority = opts.priority;
  if (opts.enabled !== undefined) updates.enabled = opts.enabled ? 1 : 0;
  if (opts.description !== undefined) updates.description = opts.description;

  let normalizedValue: string | undefined;
  if (opts.value !== undefined) {
    normalizedValue = opts.value.trim().toLowerCase();
    if (!normalizedValue) throw new Error("Value cannot be empty.");
    const finalType = opts.type ?? existing.type;
    if (finalType === "ip_cidr" && !normalizedValue.includes("/")) {
      throw new Error("IP CIDR must include a prefix length (e.g., 192.168.1.0/24).");
    }
    updates.value = normalizedValue;
  }

  // 检查 type+value 唯一性（排除自身）
  if (opts.type !== undefined || opts.value !== undefined) {
    const finalType = opts.type ?? existing.type;
    const finalValue = normalizedValue ?? existing.value;
    const dup = db
      .select()
      .from(customRules)
      .where(and(eq(customRules.type, finalType), eq(customRules.value, finalValue)))
      .get();
    if (dup && dup.id !== id) {
      throw new Error(
        `Duplicate rule: ${finalType} "${finalValue}" already exists (id: ${dup.id}).`,
      );
    }
  }

  if (Object.keys(updates).length === 0) {
    return existing;
  }

  return db
    .update(customRules)
    .set(updates)
    .where(eq(customRules.id, id))
    .returning()
    .get();
}
