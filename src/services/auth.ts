import { eq, and } from "drizzle-orm";
import type { Db } from "../db/index";
import { nodes, users, userNodes } from "../db/schema";

export interface AuthResult {
  ok: boolean;
  id?: string;
}

// 认证：校验节点 + 用户 + 权限
export function authenticate(
  db: Db,
  nodeId: string,
  authSecret: string,
  password: string
): AuthResult {
  // 1. 校验节点：存在、密钥匹配、已启用
  const node = db
    .select({ id: nodes.id })
    .from(nodes)
    .where(
      and(
        eq(nodes.id, nodeId),
        eq(nodes.auth_secret, authSecret),
        eq(nodes.enabled, 1)
      )
    )
    .get();

  if (!node) return { ok: false };

  // 2. 根据密码查找用户
  const user = db
    .select({
      id: users.id,
      name: users.name,
      enabled: users.enabled,
      expires_at: users.expires_at,
      quota_bytes: users.quota_bytes,
      used_bytes: users.used_bytes,
    })
    .from(users)
    .where(eq(users.password, password))
    .get();

  if (!user) return { ok: false };

  // 3. 校验用户状态
  if (user.enabled !== 1) return { ok: false };

  if (user.expires_at && new Date(user.expires_at) < new Date()) {
    return { ok: false };
  }

  if (user.quota_bytes! > 0 && user.used_bytes! >= user.quota_bytes!) {
    return { ok: false };
  }

  // 4. 校验节点权限
  const permission = db
    .select({ user_id: userNodes.user_id })
    .from(userNodes)
    .where(
      and(eq(userNodes.user_id, user.id), eq(userNodes.node_id, nodeId))
    )
    .get();

  if (!permission) return { ok: false };

  // 5. 全部校验通过
  return { ok: true, id: user.name };
}
