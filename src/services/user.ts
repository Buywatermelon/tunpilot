import { eq } from "drizzle-orm";
import type { Db } from "../db/index";
import { users, nodes, userNodes, type User, type NewUser } from "../db/schema";

// 创建用户参数（不含自动生成字段）
export type CreateUserParams = Pick<NewUser, "name" | "password"> &
  Partial<Pick<NewUser, "quota_bytes" | "expires_at" | "max_devices">>;

// 更新用户参数（所有可更新字段均为可选）
export type UpdateUserParams = Partial<
  Pick<User, "quota_bytes" | "expires_at" | "enabled" | "password" | "max_devices">
>;

// 创建用户
export function createUser(db: Db, params: CreateUserParams): User {
  return db.insert(users).values(params).returning().get();
}

// 列出所有用户
export function listUsers(db: Db): User[] {
  return db.select().from(users).all();
}

// 根据 ID 获取用户
export function getUser(db: Db, id: string): User | null {
  return db.select().from(users).where(eq(users.id, id)).get() ?? null;
}

// 更新用户（部分更新）
export function updateUser(db: Db, id: string, updates: UpdateUserParams): User | null {
  const existing = getUser(db, id);
  if (!existing) return null;
  if (Object.keys(updates).length === 0) return existing;
  db.update(users).set(updates).where(eq(users.id, id)).run();
  return getUser(db, id);
}

// 删除用户（级联删除关联数据）
export function deleteUser(db: Db, id: string): void {
  db.delete(users).where(eq(users.id, id)).run();
}

// 重置用户流量
export function resetTraffic(db: Db, userId: string): void {
  db.update(users).set({ used_bytes: 0 }).where(eq(users.id, userId)).run();
}

// 为用户分配节点（替换现有分配）
export function assignNodesToUser(db: Db, userId: string, nodeIds: string[]): void {
  db.delete(userNodes).where(eq(userNodes.user_id, userId)).run();
  for (const nodeId of nodeIds) {
    db.insert(userNodes).values({ user_id: userId, node_id: nodeId }).run();
  }
}

// 获取用户关联的节点列表
export function getUserNodes(db: Db, userId: string): (typeof nodes.$inferSelect)[] {
  const rows = db
    .select({ node: nodes })
    .from(nodes)
    .innerJoin(userNodes, eq(userNodes.node_id, nodes.id))
    .where(eq(userNodes.user_id, userId))
    .all();
  return rows.map((r) => r.node);
}

// 重新导出类型供其他模块使用
export type { User } from "../db/schema";
