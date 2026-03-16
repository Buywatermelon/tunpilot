import type { Node } from "../../db/schema";
import { XrayClient } from "./client";
import { needsTunnel, ensureTunnel, closeTunnel } from "./tunnel";

export type ClientFactory = (host: string, port: number) => XrayClient;

interface PoolEntry {
  client: XrayClient;
  tunnelNodeId?: string; // set if this entry uses an SSH tunnel
}

const pool = new Map<string, PoolEntry>();
let clientFactory: ClientFactory = (host, port) => new XrayClient(host, port);

/**
 * Override the client factory (for testing).
 */
export function setClientFactory(factory: ClientFactory): void {
  clientFactory = factory;
}

/**
 * Get or create an XrayClient for a Trojan node.
 * If the node has SSH config, creates an SSH tunnel first.
 * Returns null if the node is not a Trojan node or has no stats_port.
 */
export async function getXrayClient(node: Node): Promise<XrayClient | null> {
  if (node.protocol !== "trojan" || !node.stats_port) return null;

  const existing = pool.get(node.id);
  if (existing) return existing.client;

  let host: string;
  let port: number;
  let tunnelNodeId: string | undefined;

  if (needsTunnel(node)) {
    port = await ensureTunnel(node);
    host = "127.0.0.1";
    tunnelNodeId = node.id;
  } else {
    host = node.host;
    port = node.stats_port;
  }

  const client = clientFactory(host, port);
  pool.set(node.id, { client, tunnelNodeId });
  return client;
}

/**
 * Remove a specific client from the pool (e.g. when node config changes).
 */
export function removeXrayClient(nodeId: string): void {
  const entry = pool.get(nodeId);
  if (entry) {
    entry.client.close();
    if (entry.tunnelNodeId) closeTunnel(entry.tunnelNodeId);
    pool.delete(nodeId);
  }
}

/**
 * Close all pooled gRPC clients and their SSH tunnels. Called on graceful shutdown.
 */
export function closeAllXrayClients(): void {
  for (const entry of pool.values()) {
    entry.client.close();
  }
  pool.clear();
}
