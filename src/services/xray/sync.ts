import { eq, and } from "drizzle-orm";
import type { Db } from "../../db/index";
import { nodes, users, type Node } from "../../db/schema";
import { sshExec, sshWriteFile } from "./ssh";
import { isCallAllowed, recordSuccess, recordFailure } from "../../lib/circuit-breaker";
import {
  type SyncError,
  type ReconcileResult,
  getNodeActiveUsers,
  getUserNodesByProtocol,
  getEnabledNodesByProtocol,
  withNodeLock,
  deployNodes,
  reconcileNodes,
} from "../sync-utils";

export type { SyncError, ReconcileResult };

const DEFAULT_CONFIG_PATH = "/usr/local/etc/xray/config.json";
const INBOUND_TAG = "trojan-in";

/** Get all Trojan nodes assigned to a user. */
export function getUserTrojanNodes(db: Db, userId: string): Node[] {
  return getUserNodesByProtocol(db, userId, "trojan");
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

    const circuitKey = `xray:${node.id}`;
    if (!isCallAllowed(circuitKey)) {
      result.errors.push(`Circuit open for node ${node.name}, skipping deploy`);
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

      const trojanInbound = config.inbounds?.find(
        (i: { tag?: string }) => i.tag === INBOUND_TAG,
      );
      if (!trojanInbound) {
        result.errors.push(`Inbound '${INBOUND_TAG}' not found in config`);
        return result;
      }

      interface XrayClient { password: string; email: string; level: number }
      const currentClients: XrayClient[] = (trojanInbound.settings?.clients || [])
        .map((c: XrayClient) => ({ password: c.password, email: c.email, level: c.level ?? 0 }))
        .sort((a: XrayClient, b: XrayClient) => a.email.localeCompare(b.email));

      // Skip restart if config already matches desired state
      if (JSON.stringify(desiredClients) === JSON.stringify(currentClients)) {
        result.added = desiredClients.length;
        recordSuccess(circuitKey);
        return result;
      }

      trojanInbound.settings.clients = desiredClients;
      await sshWriteFile(node, configPath, JSON.stringify(config, null, 2));
      await sshExec(node, "sudo systemctl restart xray");

      result.added = desiredClients.length;
      recordSuccess(circuitKey);
    } catch (err: unknown) {
      recordFailure(circuitKey);
      result.errors.push(err instanceof Error ? err.message : String(err));
    }

    return result;
  });
}

/**
 * Sync a user's Trojan nodes: deploy desired config for each assigned node.
 */
export async function syncUserToXrayNodes(db: Db, userId: string): Promise<SyncError[]> {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return [];

  const trojanNodes = getUserTrojanNodes(db, userId);
  if (trojanNodes.length === 0) return [];

  return deployNodes(trojanNodes, (node) => deployNodeUsers(db, node));
}

/**
 * Deploy config for specific Trojan nodes (used after user removal from nodes).
 */
export async function syncTrojanNodes(db: Db, nodeIds: string[]): Promise<SyncError[]> {
  const trojanNodes = nodeIds
    .map((id) => db.select().from(nodes).where(and(eq(nodes.id, id), eq(nodes.protocol, "trojan"))).get())
    .filter((n): n is Node => n !== undefined);

  return deployNodes(trojanNodes, (node) => deployNodeUsers(db, node));
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
  const trojanNodes = getEnabledNodesByProtocol(db, "trojan");
  return reconcileNodes(trojanNodes, (node) => deployNodeUsers(db, node));
}
