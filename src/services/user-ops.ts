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
import {
  syncUserToXrayNodes,
  syncTrojanNodes,
  getUserTrojanNodes,
  type SyncError,
} from "./xray/sync";

/**
 * Update a user and sync to Xray nodes if password or enabled status changed.
 */
export async function updateUserWithSync(
  db: Db,
  id: string,
  updates: UpdateUserParams
): Promise<User | null> {
  const user = updateUser(db, id, updates);
  if (!user) return null;

  // Sync if fields that affect Xray state changed
  if ("password" in updates || "enabled" in updates || "quota_bytes" in updates || "expires_at" in updates) {
    const errors = await syncUserToXrayNodes(db, id);
    if (errors.length > 0) {
      console.warn(`Xray sync errors for user ${id}:`, errors);
    }
  }

  return user;
}

/**
 * Delete a user and sync config to remove them from all Xray nodes.
 * Gets affected nodes BEFORE deletion, then deploys config AFTER.
 */
export async function deleteUserWithSync(db: Db, id: string): Promise<void> {
  // Snapshot affected Trojan node IDs before deletion
  const affectedNodeIds = getUserTrojanNodes(db, id).map((n) => n.id);

  // Delete from DB (CASCADE removes userNodes)
  deleteUser(db, id);

  // Deploy config for affected nodes (user is now gone)
  if (affectedNodeIds.length > 0) {
    const errors = await syncTrojanNodes(db, affectedNodeIds);
    if (errors.length > 0) {
      console.warn(`Xray sync errors after deleting user ${id}:`, errors);
    }
  }
}

/**
 * Assign nodes to a user and sync Xray config for all affected Trojan nodes.
 */
export async function assignNodesWithSync(
  db: Db,
  userId: string,
  nodeIds: string[]
): Promise<void> {
  // Get old Trojan node IDs before reassignment
  const oldNodes = getUserNodes(db, userId);
  const oldTrojanIds = new Set(oldNodes.filter((n) => n.protocol === "trojan").map((n) => n.id));

  // Do the DB reassignment
  assignNodesToUser(db, userId, nodeIds);

  // Get new Trojan node IDs after reassignment
  const newNodes = getUserNodes(db, userId);
  const newTrojanIds = new Set(newNodes.filter((n) => n.protocol === "trojan").map((n) => n.id));

  // Deploy config for all affected nodes (both removed and added)
  const allAffectedIds = [...new Set([...oldTrojanIds, ...newTrojanIds])];
  if (allAffectedIds.length > 0) {
    const errors = await syncTrojanNodes(db, allAffectedIds);
    if (errors.length > 0) console.warn(`Xray sync errors:`, errors);
  }
}

/**
 * Add a single node to a user and sync Xray config if it's a Trojan node.
 */
export async function addNodeWithSync(
  db: Db,
  userId: string,
  nodeId: string
): Promise<{ added: boolean; errors: SyncError[] }> {
  const added = addNodeToUser(db, userId, nodeId);
  if (!added) return { added: false, errors: [] };

  const errors = await syncTrojanNodes(db, [nodeId]);
  return { added: true, errors };
}

/**
 * Remove a single node from a user and sync Xray config.
 */
export async function removeNodeWithSync(
  db: Db,
  userId: string,
  nodeId: string
): Promise<{ removed: boolean; errors: SyncError[] }> {
  const removed = removeNodeFromUser(db, userId, nodeId);
  if (!removed) return { removed: false, errors: [] };

  // User is already removed from this node in DB; deploy to update config
  const errors = await syncTrojanNodes(db, [nodeId]);
  return { removed: true, errors };
}

/**
 * Reset traffic in DB and re-sync user to Xray nodes (re-enables if quota-disabled).
 */
export async function resetTrafficWithSync(db: Db, userId: string): Promise<void> {
  resetTraffic(db, userId);

  const errors = await syncUserToXrayNodes(db, userId);
  if (errors.length > 0) {
    console.warn(`Xray sync errors after traffic reset for user ${userId}:`, errors);
  }
}
