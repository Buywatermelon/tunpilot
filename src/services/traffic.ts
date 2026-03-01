import type { Database } from "bun:sqlite";
import type { Node } from "./node";

export interface SyncResult {
  nodeId: string;
  synced: number;
  errors: string[];
}

export interface TrafficFilters {
  userId?: string;
  nodeId?: string;
  from?: string;
  to?: string;
}

export interface TrafficStat {
  userId: string;
  nodeId: string;
  txBytes: number;
  rxBytes: number;
  recordedAt: string;
}

export async function syncTrafficFromNode(
  db: Database,
  node: Node
): Promise<SyncResult> {
  const result: SyncResult = { nodeId: node.id, synced: 0, errors: [] };

  let data: Record<string, { tx: number; rx: number }>;
  try {
    const res = await fetch(
      `http://${node.host}:${node.stats_port}/traffic?clear=1`,
      {
        headers: { Authorization: node.stats_secret! },
      }
    );
    if (!res.ok) {
      result.errors.push(`HTTP ${res.status} from node ${node.name}`);
      return result;
    }
    data = await res.json();
  } catch (err: any) {
    result.errors.push(`Fetch failed for node ${node.name}: ${err.message}`);
    return result;
  }

  const insertLog = db.prepare(
    "INSERT INTO traffic_logs (user_id, node_id, tx_bytes, rx_bytes) VALUES (?, ?, ?, ?)"
  );
  const updateUsed = db.prepare(
    "UPDATE users SET used_bytes = used_bytes + ? WHERE id = ?"
  );
  const findUser = db.prepare("SELECT id FROM users WHERE name = ?");

  for (const [username, traffic] of Object.entries(data)) {
    const totalBytes = traffic.tx + traffic.rx;
    if (totalBytes === 0) continue;

    const user = findUser.get(username) as { id: string } | null;
    if (!user) {
      result.errors.push(`Unknown user: ${username}`);
      continue;
    }

    insertLog.run(user.id, node.id, traffic.tx, traffic.rx);
    updateUsed.run(totalBytes, user.id);
    result.synced++;
  }

  return result;
}

export async function syncAllNodes(db: Database): Promise<SyncResult[]> {
  const nodes = db
    .query(
      "SELECT * FROM nodes WHERE enabled = 1 AND stats_port IS NOT NULL"
    )
    .all() as Node[];

  const results: SyncResult[] = [];

  for (const node of nodes) {
    const result = await syncTrafficFromNode(db, node);
    results.push(result);
  }

  return results;
}

export function getTrafficStats(
  db: Database,
  filters?: TrafficFilters
): TrafficStat[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.userId) {
    conditions.push("user_id = ?");
    params.push(filters.userId);
  }
  if (filters?.nodeId) {
    conditions.push("node_id = ?");
    params.push(filters.nodeId);
  }
  if (filters?.from) {
    conditions.push("recorded_at >= ?");
    params.push(filters.from);
  }
  if (filters?.to) {
    conditions.push("recorded_at < ?");
    params.push(filters.to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .query(
      `SELECT user_id, node_id, tx_bytes, rx_bytes, recorded_at FROM traffic_logs ${where}`
    )
    .all(...params) as {
    user_id: string;
    node_id: string;
    tx_bytes: number;
    rx_bytes: number;
    recorded_at: string;
  }[];

  return rows.map((r) => ({
    userId: r.user_id,
    nodeId: r.node_id,
    txBytes: r.tx_bytes,
    rxBytes: r.rx_bytes,
    recordedAt: r.recorded_at,
  }));
}

export function startTrafficSync(db: Database, intervalMs: number): Timer {
  return setInterval(() => {
    syncAllNodes(db).catch((err) => {
      console.error("Traffic sync failed:", err);
    });
  }, intervalMs);
}
