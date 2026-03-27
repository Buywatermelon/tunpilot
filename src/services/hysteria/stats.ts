import type { Node } from "../../db/schema";
import { ensureTunnel, needsTunnel } from "../xray/tunnel";

const DEFAULT_TIMEOUT_MS = 10_000;

async function getStatsBaseUrl(node: Node): Promise<string> {
  if (!node.stats_port) {
    throw new Error(`Node ${node.name} has no stats_port configured`);
  }

  if (needsTunnel(node)) {
    const localPort = await ensureTunnel(node);
    return `http://127.0.0.1:${localPort}`;
  }

  return `http://${node.host}:${node.stats_port}`;
}

async function requestStats(
  node: Node,
  clear: boolean,
  timeoutMs: number,
): Promise<Response> {
  const baseUrl = await getStatsBaseUrl(node);
  const search = clear ? "?clear=1" : "";
  return fetch(`${baseUrl}/traffic${search}`, {
    headers: { Authorization: node.stats_secret ?? "" },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function queryHysteriaTraffic(
  node: Node,
  clear: boolean,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Record<string, { tx: number; rx: number }>> {
  const res = await requestStats(node, clear, timeoutMs);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from node ${node.name}`);
  }
  return await res.json() as Record<string, { tx: number; rx: number }>;
}

export async function pingHysteriaStats(node: Node): Promise<string> {
  const res = await requestStats(node, false, 5_000);
  return res.ok ? "online" : `error_${res.status}`;
}
