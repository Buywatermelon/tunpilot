import type { Db } from "../db/index";
import type { User } from "../db/schema";
import {
  updateUser,
  deleteUser,
  resetTraffic,
  assignNodesToUser,
  addNodeToUser,
  removeNodeFromUser,
  getUserNodes,
  type UpdateUserParams,
} from "./user";
import { syncUserToXrayNodes, syncTrojanNodes, type SyncError } from "./xray/sync";
import { syncUserToHysteriaNodes, syncHysteriaNodes } from "./hysteria/sync";

/** Sync a user's config to all assigned nodes (both protocols). */
async function syncUserToAllNodes(db: Db, userId: string): Promise<SyncError[]> {
  const [xrayErrors, hy2Errors] = await Promise.all([
    syncUserToXrayNodes(db, userId),
    syncUserToHysteriaNodes(db, userId),
  ]);
  return [...xrayErrors, ...hy2Errors];
}

/** Deploy config to specific nodes, routing by protocol. Each sync function filters internally. */
export async function syncNodesByIds(db: Db, nodeIds: string[]): Promise<SyncError[]> {
  if (nodeIds.length === 0) return [];
  const [xrayErrors, hy2Errors] = await Promise.all([
    syncTrojanNodes(db, nodeIds),
    syncHysteriaNodes(db, nodeIds),
  ]);
  return [...xrayErrors, ...hy2Errors];
}

/**
 * Update a user and sync to all nodes if password or enabled status changed.
 */
export async function updateUserWithSync(
  db: Db,
  id: string,
  updates: UpdateUserParams
): Promise<User | null> {
  const user = updateUser(db, id, updates);
  if (!user) return null;

  if ("password" in updates || "enabled" in updates || "quota_bytes" in updates || "expires_at" in updates) {
    const errors = await syncUserToAllNodes(db, id);
    if (errors.length > 0) console.warn(`Node sync errors for user ${id}:`, errors);
  }

  return user;
}

/**
 * Delete a user and sync config to remove them from all nodes.
 * Gets affected node IDs BEFORE deletion, then deploys config AFTER.
 */
export async function deleteUserWithSync(db: Db, id: string): Promise<void> {
  const affectedNodeIds = getUserNodes(db, id).map((n) => n.id);
  deleteUser(db, id);

  const errors = await syncNodesByIds(db, affectedNodeIds);
  if (errors.length > 0) console.warn(`Sync errors after deleting user ${id}:`, errors);
}

/**
 * Assign nodes to a user and sync config for all affected nodes.
 */
export async function assignNodesWithSync(
  db: Db,
  userId: string,
  nodeIds: string[]
): Promise<void> {
  const oldNodeIds = getUserNodes(db, userId).map((n) => n.id);
  assignNodesToUser(db, userId, nodeIds);
  const newNodeIds = getUserNodes(db, userId).map((n) => n.id);

  const allAffectedIds = [...new Set([...oldNodeIds, ...newNodeIds])];
  const errors = await syncNodesByIds(db, allAffectedIds);
  if (errors.length > 0) console.warn(`Sync errors:`, errors);
}

/**
 * Add a single node to a user and sync config.
 */
export async function addNodeWithSync(
  db: Db,
  userId: string,
  nodeId: string
): Promise<{ added: boolean; errors: SyncError[] }> {
  const added = addNodeToUser(db, userId, nodeId);
  if (!added) return { added: false, errors: [] };

  const errors = await syncNodesByIds(db, [nodeId]);
  return { added: true, errors };
}

/**
 * Remove a single node from a user and sync config.
 */
export async function removeNodeWithSync(
  db: Db,
  userId: string,
  nodeId: string
): Promise<{ removed: boolean; errors: SyncError[] }> {
  const removed = removeNodeFromUser(db, userId, nodeId);
  if (!removed) return { removed: false, errors: [] };

  const errors = await syncNodesByIds(db, [nodeId]);
  return { removed: true, errors };
}

/**
 * Reset traffic in DB and re-sync user to all nodes (re-enables if quota-disabled).
 */
export async function resetTrafficWithSync(db: Db, userId: string): Promise<void> {
  resetTraffic(db, userId);

  const errors = await syncUserToAllNodes(db, userId);
  if (errors.length > 0) console.warn(`Sync errors after traffic reset for user ${userId}:`, errors);
}
