import type { Database } from "bun:sqlite";

export interface AuthResult {
  ok: boolean;
  id?: string;
}

export function authenticate(
  db: Database,
  nodeId: string,
  authSecret: string,
  password: string
): AuthResult {
  // 1. Validate node: exists, auth_secret matches, enabled
  const node = db
    .query(
      "SELECT id, auth_secret, enabled FROM nodes WHERE id = ? AND auth_secret = ? AND enabled = 1"
    )
    .get(nodeId, authSecret) as { id: string } | null;

  if (!node) return { ok: false };

  // 2. Find user by password
  const user = db
    .query(
      "SELECT id, name, enabled, expires_at, quota_bytes, used_bytes FROM users WHERE password = ?"
    )
    .get(password) as {
    id: string;
    name: string;
    enabled: number;
    expires_at: string | null;
    quota_bytes: number;
    used_bytes: number;
  } | null;

  if (!user) return { ok: false };

  // 3. Check user status
  if (user.enabled !== 1) return { ok: false };

  if (user.expires_at && new Date(user.expires_at) < new Date()) {
    return { ok: false };
  }

  if (user.quota_bytes > 0 && user.used_bytes >= user.quota_bytes) {
    return { ok: false };
  }

  // 4. Check node permission
  const permission = db
    .query(
      "SELECT 1 FROM user_nodes WHERE user_id = ? AND node_id = ?"
    )
    .get(user.id, nodeId);

  if (!permission) return { ok: false };

  // 5. All checks passed
  return { ok: true, id: user.name };
}
