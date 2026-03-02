import { eq, and, gte, lt, sql, isNotNull } from "drizzle-orm";
import type { Db } from "../db/index";
import { nodes, users, trafficLogs, type Node } from "../db/schema";

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

// 从单个节点同步流量数据
export async function syncTrafficFromNode(
  db: Db,
  node: Node
): Promise<SyncResult> {
  const result: SyncResult = { nodeId: node.id, synced: 0, errors: [] };

  let data: Record<string, { tx: number; rx: number }>;
  try {
    const res = await fetch(
      `http://${node.host}:${node.stats_port}/traffic?clear=1`,
      { headers: { Authorization: node.stats_secret! } }
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

  for (const [username, traffic] of Object.entries(data)) {
    const totalBytes = traffic.tx + traffic.rx;
    if (totalBytes === 0) continue;

    // 根据用户名查找用户
    const user = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.name, username))
      .get();

    if (!user) {
      result.errors.push(`Unknown user: ${username}`);
      continue;
    }

    // 写入流量日志
    db.insert(trafficLogs)
      .values({
        user_id: user.id,
        node_id: node.id,
        tx_bytes: traffic.tx,
        rx_bytes: traffic.rx,
      })
      .run();

    // 累加用户已用流量
    db.update(users)
      .set({ used_bytes: sql`used_bytes + ${totalBytes}` })
      .where(eq(users.id, user.id))
      .run();

    result.synced++;
  }

  return result;
}

// 同步所有已启用且配置了 stats_port 的节点
export async function syncAllNodes(db: Db): Promise<SyncResult[]> {
  const enabledNodes = db
    .select()
    .from(nodes)
    .where(and(eq(nodes.enabled, 1), isNotNull(nodes.stats_port)))
    .all();

  const results: SyncResult[] = [];
  for (const node of enabledNodes) {
    const result = await syncTrafficFromNode(db, node);
    results.push(result);
  }
  return results;
}

// 查询流量统计（支持多维度筛选）
export function getTrafficStats(db: Db, filters?: TrafficFilters): TrafficStat[] {
  const conditions = [];

  if (filters?.userId) conditions.push(eq(trafficLogs.user_id, filters.userId));
  if (filters?.nodeId) conditions.push(eq(trafficLogs.node_id, filters.nodeId));
  if (filters?.from) conditions.push(gte(trafficLogs.recorded_at, filters.from));
  if (filters?.to) conditions.push(lt(trafficLogs.recorded_at, filters.to));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select({
      user_id: trafficLogs.user_id,
      node_id: trafficLogs.node_id,
      tx_bytes: trafficLogs.tx_bytes,
      rx_bytes: trafficLogs.rx_bytes,
      recorded_at: trafficLogs.recorded_at,
    })
    .from(trafficLogs)
    .where(where)
    .all();

  return rows.map((r) => ({
    userId: r.user_id!,
    nodeId: r.node_id!,
    txBytes: r.tx_bytes!,
    rxBytes: r.rx_bytes!,
    recordedAt: r.recorded_at!,
  }));
}

// 启动定时流量同步
export function startTrafficSync(db: Db, intervalMs: number): Timer {
  return setInterval(() => {
    syncAllNodes(db).catch((err) => {
      console.error("Traffic sync failed:", err);
    });
  }, intervalMs);
}
