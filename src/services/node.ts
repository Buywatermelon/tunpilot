import { eq } from "drizzle-orm";
import type { Db } from "../db/index";
import { nodes, type Node, type NewNode } from "../db/schema";

// 添加节点参数
export type AddNodeParams = Pick<NewNode, "name" | "host" | "port" | "protocol"> &
  Partial<Pick<NewNode, "stats_port" | "stats_secret" | "sni" | "cert_path" | "cert_expires" | "hy2_version" | "config_path" | "ssh_user" | "ssh_port" | "enabled">>;

// 更新节点参数（排除不可修改字段）
export type UpdateNodeParams = Partial<Omit<Node, "id" | "auth_secret" | "created_at">>;

// 生成 32 字节随机十六进制字符串
function generateAuthSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// 添加节点（自动生成 auth_secret）
export function addNode(db: Db, params: AddNodeParams): Node {
  return db.insert(nodes).values({
    ...params,
    auth_secret: generateAuthSecret(),
  }).returning().get();
}

// 列出所有节点
export function listNodes(db: Db): Node[] {
  return db.select().from(nodes).all();
}

// 根据 ID 获取节点
export function getNode(db: Db, id: string): Node | null {
  return db.select().from(nodes).where(eq(nodes.id, id)).get() ?? null;
}

// 更新节点（部分更新）
export function updateNode(db: Db, id: string, updates: UpdateNodeParams): Node | null {
  const existing = getNode(db, id);
  if (!existing) return null;
  if (Object.keys(updates).length === 0) return existing;
  db.update(nodes).set(updates).where(eq(nodes.id, id)).run();
  return getNode(db, id);
}

// 删除节点（级联删除 user_nodes）
export function removeNode(db: Db, id: string): void {
  db.delete(nodes).where(eq(nodes.id, id)).run();
}

export type { Node } from "../db/schema";
