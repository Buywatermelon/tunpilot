import { Database } from "bun:sqlite";

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
  ssh_port: number | null;
  enabled: number;
  created_at: string;
}

export interface AddNodeParams {
  name: string;
  host: string;
  port: number;
  protocol: string;
  stats_port?: number;
  stats_secret?: string;
  sni?: string;
  cert_path?: string;
  cert_expires?: string;
  hy2_version?: string;
  config_path?: string;
  ssh_user?: string;
  ssh_port?: number;
  enabled?: number;
}

export type UpdateNodeParams = Partial<Omit<Node, "id" | "auth_secret" | "created_at">>;

function generateAuthSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function addNode(db: Database, params: AddNodeParams): Node {
  const id = crypto.randomUUID();
  const auth_secret = generateAuthSecret();

  db.run(
    `INSERT INTO nodes (id, name, host, port, protocol, auth_secret, stats_port, stats_secret, sni, cert_path, cert_expires, hy2_version, config_path, ssh_user, ssh_port, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.name,
      params.host,
      params.port,
      params.protocol,
      auth_secret,
      params.stats_port ?? null,
      params.stats_secret ?? null,
      params.sni ?? null,
      params.cert_path ?? null,
      params.cert_expires ?? null,
      params.hy2_version ?? null,
      params.config_path ?? null,
      params.ssh_user ?? null,
      params.ssh_port ?? null,
      params.enabled ?? 1,
    ]
  );

  return getNode(db, id)!;
}

export function listNodes(db: Database): Node[] {
  return db.query("SELECT * FROM nodes").all() as Node[];
}

export function getNode(db: Database, id: string): Node | null {
  return (db.query("SELECT * FROM nodes WHERE id = ?").get(id) as Node) ?? null;
}

export function updateNode(db: Database, id: string, updates: UpdateNodeParams): Node | null {
  const existing = getNode(db, id);
  if (!existing) return null;

  const fields = Object.keys(updates) as (keyof UpdateNodeParams)[];
  if (fields.length === 0) return existing;

  const setClauses = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => updates[f] ?? null);

  db.run(`UPDATE nodes SET ${setClauses} WHERE id = ?`, [...values, id]);

  return getNode(db, id);
}

export function removeNode(db: Database, id: string): void {
  db.run("DELETE FROM nodes WHERE id = ?", [id]);
}
