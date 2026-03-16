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
  removeUserFromXrayNodes,
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
 * Delete a user after removing from all Xray nodes.
 */
export async function deleteUserWithSync(db: Db, id: string): Promise<void> {
  // Remove from Xray nodes before DB deletion (need user data for gRPC call)
  const errors = await removeUserFromXrayNodes(db, id);
  if (errors.length > 0) {
    console.warn(`Xray removal errors for user ${id}:`, errors);
  }

  deleteUser(db, id);
}

/**
 * Assign nodes to a user and sync Xray state for newly added/removed Trojan nodes.
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

  // Remove user from Trojan nodes that were unassigned
  const removedIds = [...oldTrojanIds].filter((id) => !newTrojanIds.has(id));
  if (removedIds.length > 0) {
    const errors = await removeUserFromXrayNodes(db, userId, removedIds);
    if (errors.length > 0) console.warn(`Xray removal errors:`, errors);
  }

  // Add user to newly assigned Trojan nodes
  if (newTrojanIds.size > 0) {
    const errors = await syncUserToXrayNodes(db, userId);
    if (errors.length > 0) console.warn(`Xray sync errors:`, errors);
  }
}

/**
 * Add a single node to a user and sync Xray state if it's a Trojan node.
 */
export async function addNodeWithSync(
  db: Db,
  userId: string,
  nodeId: string
): Promise<{ added: boolean; errors: string[] }> {
  const added = addNodeToUser(db, userId, nodeId);
  if (!added) return { added: false, errors: [] };

  const errors = await syncUserToXrayNodes(db, userId);
  return { added: true, errors };
}

/**
 * Remove a single node from a user and sync Xray state if it's a Trojan node.
 */
export async function removeNodeWithSync(
  db: Db,
  userId: string,
  nodeId: string
): Promise<{ removed: boolean; errors: string[] }> {
  const removed = removeNodeFromUser(db, userId, nodeId);
  if (!removed) return { removed: false, errors: [] };

  const errors = await removeUserFromXrayNodes(db, userId, [nodeId]);
  return { removed: true, errors };
}

/**
 * Reset traffic in DB and reset Xray stats for the user's Trojan nodes.
 */
export async function resetTrafficWithSync(db: Db, userId: string): Promise<void> {
  resetTraffic(db, userId);

  // Re-sync user to Xray nodes — if the user was previously removed due to
  // exceeded quota, this re-adds them now that used_bytes is reset to 0.
  const errors = await syncUserToXrayNodes(db, userId);
  if (errors.length > 0) {
    console.warn(`Xray sync errors after traffic reset for user ${userId}:`, errors);
  }
}
