import { eq, and } from "drizzle-orm";
import type { Db } from "../db/index";
import { nodes, users, userNodes, type Node, type User } from "../db/schema";

// ── Shared types ────────────────────────────────────────────────

export interface SyncError {
  nodeId: string;
  nodeName: string;
  error: string;
}

export interface ReconcileResult {
  nodeId: string;
  nodeName: string;
  added: number;
  removed: number;
  errors: string[];
}

// ── Shared helpers ──────────────────────────────────────────────

/** Check if a user is active (enabled, not expired, within quota). */
export function isUserActive(user: User): boolean {
  if (user.enabled !== 1) return false;
  if (user.expires_at && new Date(user.expires_at) < new Date()) return false;
  if (user.quota_bytes! > 0 && user.used_bytes! >= user.quota_bytes!) return false;
  return true;
}

/** Get all active users assigned to a specific node. */
export function getNodeActiveUsers(db: Db, nodeId: string): User[] {
  return db
    .select({ user: users })
    .from(users)
    .innerJoin(userNodes, eq(userNodes.user_id, users.id))
    .where(and(eq(userNodes.node_id, nodeId), eq(users.enabled, 1)))
    .all()
    .map((r) => r.user)
    .filter(isUserActive);
}

/** Get all nodes of a given protocol assigned to a user. */
export function getUserNodesByProtocol(db: Db, userId: string, protocol: string): Node[] {
  return db
    .select({ node: nodes })
    .from(nodes)
    .innerJoin(userNodes, eq(userNodes.node_id, nodes.id))
    .where(and(eq(userNodes.user_id, userId), eq(nodes.protocol, protocol), eq(nodes.enabled, 1)))
    .all()
    .map((r) => r.node);
}

/** Get all enabled nodes of a given protocol. */
export function getEnabledNodesByProtocol(db: Db, protocol: string): Node[] {
  return db
    .select()
    .from(nodes)
    .where(and(eq(nodes.protocol, protocol), eq(nodes.enabled, 1)))
    .all();
}

// ── Per-node lock ───────────────────────────────────────────────

const nodeLocks = new Map<string, Promise<unknown>>();

export function withNodeLock<T>(nodeId: string, fn: () => Promise<T>): Promise<T> {
  const prev = nodeLocks.get(nodeId) ?? Promise.resolve();
  const next = prev.then(() => fn(), () => fn());
  nodeLocks.set(nodeId, next);
  return next;
}

// ── Deploy helper ───────────────────────────────────────────────

/**
 * Deploy config to multiple nodes in parallel, collecting errors.
 * `deployFn` is the protocol-specific deploy function.
 */
export async function deployNodes(
  nodeList: Node[],
  deployFn: (node: Node) => Promise<ReconcileResult>,
): Promise<SyncError[]> {
  const errors: SyncError[] = [];
  const settled = await Promise.allSettled(
    nodeList.map((node) => deployFn(node)),
  );

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]!;
    if (r.status === "fulfilled" && r.value.errors.length > 0) {
      errors.push({ nodeId: nodeList[i]!.id, nodeName: nodeList[i]!.name, error: r.value.errors.join("; ") });
    } else if (r.status === "rejected") {
      errors.push({ nodeId: nodeList[i]!.id, nodeName: nodeList[i]!.name, error: String(r.reason) });
    }
  }

  return errors;
}

/**
 * Reconcile all nodes in parallel, returning per-node results.
 */
export async function reconcileNodes(
  nodeList: Node[],
  deployFn: (node: Node) => Promise<ReconcileResult>,
): Promise<ReconcileResult[]> {
  if (nodeList.length === 0) return [];

  const settled = await Promise.allSettled(
    nodeList.map((node) => deployFn(node)),
  );

  return settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { nodeId: nodeList[i]!.id, nodeName: nodeList[i]!.name, added: 0, removed: 0, errors: [String(r.reason)] },
  );
}
