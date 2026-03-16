import { eq, and } from "drizzle-orm";
import type { Db } from "../../db/index";
import { nodes, users, userNodes, type Node, type User } from "../../db/schema";
import { sshExec, sshWriteFile } from "./ssh";

const DEFAULT_CONFIG_PATH = "/usr/local/etc/xray/config.json";
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
export function getUserTrojanNodes(db: Db, userId: string): Node[] {
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

// Per-node lock to prevent concurrent config modifications
const nodeLocks = new Map<string, Promise<unknown>>();

function withNodeLock<T>(nodeId: string, fn: () => Promise<T>): Promise<T> {
  const prev = nodeLocks.get(nodeId) ?? Promise.resolve();
  const next = prev.then(() => fn(), () => fn());
  nodeLocks.set(nodeId, next);
  return next;
}

/**
 * Deploy the desired user list to a Xray node's config file.
 * Reads current config → updates clients array → writes back → restarts Xray (only if changed).
 */
export async function deployNodeUsers(db: Db, node: Node): Promise<ReconcileResult> {
  return withNodeLock(node.id, async () => {
    const result: ReconcileResult = {
      nodeId: node.id,
      nodeName: node.name,
      added: 0,
      removed: 0,
      errors: [],
    };

    if (!node.ssh_user && !node.ssh_alias) {
      result.errors.push("Node has no SSH config (ssh_user or ssh_alias required)");
      return result;
    }

    try {
      const activeUsers = getNodeActiveUsers(db, node.id);
      const desiredClients = activeUsers
        .map((u) => ({ password: u.password, email: u.name, level: 0 }))
        .sort((a, b) => a.email.localeCompare(b.email));

      const configPath = node.config_path || DEFAULT_CONFIG_PATH;
      const configStr = await sshExec(node, `cat ${configPath}`);
      const config = JSON.parse(configStr);

      const trojanInbound = config.inbounds?.find((i: any) => i.tag === INBOUND_TAG);
      if (!trojanInbound) {
        result.errors.push(`Inbound '${INBOUND_TAG}' not found in config`);
        return result;
      }

      const currentClients = (trojanInbound.settings?.clients || [])
        .map((c: any) => ({ password: c.password, email: c.email, level: c.level ?? 0 }))
        .sort((a: any, b: any) => a.email.localeCompare(b.email));

      // Skip restart if config already matches desired state
      if (JSON.stringify(desiredClients) === JSON.stringify(currentClients)) {
        result.added = desiredClients.length;
        return result;
      }

      trojanInbound.settings.clients = desiredClients;
      await sshWriteFile(node, configPath, JSON.stringify(config, null, 2));
      await sshExec(node, "systemctl restart xray");

      result.added = desiredClients.length;
    } catch (err: any) {
      result.errors.push(err.message);
    }

    return result;
  });
}

/**
 * Sync a user's Trojan nodes: deploy desired config for each assigned node.
 * Call AFTER making DB changes (user update, node assignment, etc.)
 */
export async function syncUserToXrayNodes(db: Db, userId: string): Promise<SyncError[]> {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return [];

  const trojanNodes = getUserTrojanNodes(db, userId);
  if (trojanNodes.length === 0) return [];

  return deployNodes(db, trojanNodes);
}

/**
 * Deploy config for specific Trojan nodes (used after user removal from nodes).
 * Call AFTER removing the user-node association from DB.
 */
export async function syncTrojanNodes(db: Db, nodeIds: string[]): Promise<SyncError[]> {
  const trojanNodes = nodeIds
    .map((id) => db.select().from(nodes).where(and(eq(nodes.id, id), eq(nodes.protocol, "trojan"))).get())
    .filter((n): n is Node => n !== undefined);

  return deployNodes(db, trojanNodes);
}

/**
 * Reconcile a single Trojan node: deploy desired user config.
 */
export async function reconcileXrayNode(db: Db, node: Node): Promise<ReconcileResult> {
  return deployNodeUsers(db, node);
}

/**
 * Full reconciliation: deploy desired config for every enabled Trojan node.
 */
export async function reconcileAllXrayNodes(db: Db): Promise<ReconcileResult[]> {
  const trojanNodes = db
    .select()
    .from(nodes)
    .where(and(eq(nodes.protocol, "trojan"), eq(nodes.enabled, 1)))
    .all();

  if (trojanNodes.length === 0) return [];

  const settled = await Promise.allSettled(
    trojanNodes.map((node) => deployNodeUsers(db, node))
  );

  return settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { nodeId: trojanNodes[i]!.id, nodeName: trojanNodes[i]!.name, added: 0, removed: 0, errors: [String(r.reason)] }
  );
}

/** Internal: deploy config for multiple nodes and collect errors. */
async function deployNodes(db: Db, trojanNodes: Node[]): Promise<SyncError[]> {
  const errors: SyncError[] = [];
  const settled = await Promise.allSettled(
    trojanNodes.map((node) => deployNodeUsers(db, node))
  );

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]!;
    if (r.status === "fulfilled" && r.value.errors.length > 0) {
      errors.push({ nodeId: trojanNodes[i]!.id, nodeName: trojanNodes[i]!.name, error: r.value.errors.join("; ") });
    } else if (r.status === "rejected") {
      errors.push({ nodeId: trojanNodes[i]!.id, nodeName: trojanNodes[i]!.name, error: String(r.reason) });
    }
  }

  return errors;
}
