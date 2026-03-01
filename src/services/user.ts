import type { Database } from "bun:sqlite";

export interface User {
  id: string;
  name: string;
  password: string;
  quota_bytes: number;
  used_bytes: number;
  expires_at: string | null;
  max_devices: number;
  enabled: number;
  created_at: string;
}

export interface Node {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  auth_secret: string;
  stats_port: number | null;
  stats_secret: string | null;
  sni: string | null;
  cert_path: string | null;
  cert_expires: string | null;
  hy2_version: string | null;
  config_path: string | null;
  ssh_user: string | null;
  ssh_port: number;
  enabled: number;
  created_at: string;
}

export interface CreateUserParams {
  name: string;
  password: string;
  quota_bytes?: number;
  expires_at?: string;
  max_devices?: number;
}

export interface UpdateUserParams {
  quota_bytes?: number;
  expires_at?: string;
  enabled?: number;
  password?: string;
  max_devices?: number;
}

export function createUser(db: Database, params: CreateUserParams): User {
  const id = crypto.randomUUID();
  const stmt = db.prepare(`
    INSERT INTO users (id, name, password, quota_bytes, expires_at, max_devices)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    params.name,
    params.password,
    params.quota_bytes ?? 0,
    params.expires_at ?? null,
    params.max_devices ?? 3
  );
  return getUser(db, id)!;
}

export function listUsers(db: Database): User[] {
  return db.query("SELECT * FROM users").all() as User[];
}

export function getUser(db: Database, id: string): User | null {
  return (db.query("SELECT * FROM users WHERE id = ?").get(id) as User) ?? null;
}

export function updateUser(
  db: Database,
  id: string,
  updates: UpdateUserParams
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.quota_bytes !== undefined) {
    fields.push("quota_bytes = ?");
    values.push(updates.quota_bytes);
  }
  if (updates.expires_at !== undefined) {
    fields.push("expires_at = ?");
    values.push(updates.expires_at);
  }
  if (updates.enabled !== undefined) {
    fields.push("enabled = ?");
    values.push(updates.enabled);
  }
  if (updates.password !== undefined) {
    fields.push("password = ?");
    values.push(updates.password);
  }
  if (updates.max_devices !== undefined) {
    fields.push("max_devices = ?");
    values.push(updates.max_devices);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(
    ...values
  );
}

export function deleteUser(db: Database, id: string): void {
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function resetTraffic(db: Database, userId: string): void {
  db.prepare("UPDATE users SET used_bytes = 0 WHERE id = ?").run(userId);
}

export function assignNodesToUser(
  db: Database,
  userId: string,
  nodeIds: string[]
): void {
  db.prepare("DELETE FROM user_nodes WHERE user_id = ?").run(userId);
  const insert = db.prepare(
    "INSERT INTO user_nodes (user_id, node_id) VALUES (?, ?)"
  );
  for (const nodeId of nodeIds) {
    insert.run(userId, nodeId);
  }
}

export function getUserNodes(db: Database, userId: string): Node[] {
  return db
    .query(
      `SELECT n.* FROM nodes n
       INNER JOIN user_nodes un ON un.node_id = n.id
       WHERE un.user_id = ?`
    )
    .all(userId) as Node[];
}
