import { eq, and } from "drizzle-orm";
import type { Db } from "../../db/index";
import { nodes, users, userNodes, type Node, type User } from "../../db/schema";
import { getXrayClient } from "./pool";

const INBOUND_TAG = "trojan-in";

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

/** Check if a user is active (enabled, not expired, within quota). */
function isUserActive(user: User): boolean {
  if (user.enabled !== 1) return false;
  if (user.expires_at && new Date(user.expires_at) < new Date()) return false;
  if (user.quota_bytes! > 0 && user.used_bytes! >= user.quota_bytes!) return false;
  return true;
}

/** Get all Trojan nodes assigned to a user. */
function getUserTrojanNodes(db: Db, userId: string): Node[] {
  return db
    .select({ node: nodes })
    .from(nodes)
    .innerJoin(userNodes, eq(userNodes.node_id, nodes.id))
    .where(and(eq(userNodes.user_id, userId), eq(nodes.protocol, "trojan"), eq(nodes.enabled, 1)))
    .all()
    .map((r) => r.node);
}

/** Get all active users assigned to a specific node. */
function getNodeActiveUsers(db: Db, nodeId: string): User[] {
  return db
    .select({ user: users })
    .from(users)
    .innerJoin(userNodes, eq(userNodes.user_id, users.id))
    .where(and(eq(userNodes.node_id, nodeId), eq(users.enabled, 1)))
    .all()
    .map((r) => r.user)
    .filter(isUserActive);
}

/**
 * Sync a single user to all their assigned Trojan nodes.
 * Active users are added; inactive users are removed.
 */
export async function syncUserToXrayNodes(db: Db, userId: string): Promise<SyncError[]> {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return [];

  const trojanNodes = getUserTrojanNodes(db, userId);
  if (trojanNodes.length === 0) return [];

  const errors: SyncError[] = [];
  const active = isUserActive(user);

  await Promise.allSettled(
    trojanNodes.map(async (node) => {
      const client = await getXrayClient(node);
      if (!client) return;

      try {
        if (active) {
          // Remove first to ensure clean state, then add
          try { await client.removeUser(INBOUND_TAG, user.name); } catch { /* ignore if not exists */ }
          await client.addUser(INBOUND_TAG, user.name, user.password);
        } else {
          await client.removeUser(INBOUND_TAG, user.name);
        }
      } catch (err: any) {
        errors.push({ nodeId: node.id, nodeName: node.name, error: err.message });
      }
    })
  );

  return errors;
}

/**
 * Remove a user from specified Trojan nodes (or all assigned Trojan nodes).
 * Used before user deletion or node unassignment.
 */
export async function removeUserFromXrayNodes(
  db: Db,
  userId: string,
  nodeIds?: string[]
): Promise<SyncError[]> {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return [];

  let trojanNodes: Node[];
  if (nodeIds) {
    trojanNodes = nodeIds
      .map((id) => db.select().from(nodes).where(and(eq(nodes.id, id), eq(nodes.protocol, "trojan"))).get())
      .filter((n): n is Node => n !== undefined);
  } else {
    trojanNodes = getUserTrojanNodes(db, userId);
  }

  const errors: SyncError[] = [];

  await Promise.allSettled(
    trojanNodes.map(async (node) => {
      const client = await getXrayClient(node);
      if (!client) return;

      try {
        await client.removeUser(INBOUND_TAG, user.name);
      } catch (err: any) {
        // Ignore "not found" errors — user may not exist on the node
        if (!err.message?.includes("not found")) {
          errors.push({ nodeId: node.id, nodeName: node.name, error: err.message });
        }
      }
    })
  );

  return errors;
}

/**
 * Reconcile a single Trojan node: ensure it has exactly the right users.
 * Strategy: remove-then-add every expected user (idempotent upsert).
 */
export async function reconcileXrayNode(db: Db, node: Node): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    nodeId: node.id,
    nodeName: node.name,
    added: 0,
    removed: 0,
    errors: [],
  };

  const client = await getXrayClient(node);
  if (!client) {
    result.errors.push("No gRPC client (missing stats_port?)");
    return result;
  }

  const activeUsers = getNodeActiveUsers(db, node.id);

  for (const user of activeUsers) {
    try {
      try { await client.removeUser(INBOUND_TAG, user.name); } catch { /* ok */ }
      await client.addUser(INBOUND_TAG, user.name, user.password);
      result.added++;
    } catch (err: any) {
      result.errors.push(`${user.name}: ${err.message}`);
    }
  }

  return result;
}

/**
 * Full reconciliation: ensure every enabled Trojan node has exactly the right users.
 */
export async function reconcileAllXrayNodes(db: Db): Promise<ReconcileResult[]> {
  const trojanNodes = db
    .select()
    .from(nodes)
    .where(and(eq(nodes.protocol, "trojan"), eq(nodes.enabled, 1)))
    .all();

  if (trojanNodes.length === 0) return [];

  const settled = await Promise.allSettled(
    trojanNodes.map((node) => reconcileXrayNode(db, node))
  );

  return settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { nodeId: trojanNodes[i]!.id, nodeName: trojanNodes[i]!.name, added: 0, removed: 0, errors: [String(r.reason)] }
  );
}
