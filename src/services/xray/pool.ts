import type { Node } from "../../db/schema";
import { XrayClient } from "./client";

export type ClientFactory = (host: string, port: number) => XrayClient;

const pool = new Map<string, XrayClient>();
let clientFactory: ClientFactory = (host, port) => new XrayClient(host, port);

/**
 * Override the client factory (for testing).
 */
export function setClientFactory(factory: ClientFactory): void {
  clientFactory = factory;
}

/**
 * Get or create an XrayClient for a Trojan node.
 * Returns null if the node is not a Trojan node or has no stats_port configured.
 */
export function getXrayClient(node: Node): XrayClient | null {
  if (node.protocol !== "trojan" || !node.stats_port) return null;

  const existing = pool.get(node.id);
  if (existing) return existing;

  const client = clientFactory(node.host, node.stats_port);
  pool.set(node.id, client);
  return client;
}

/**
 * Remove a specific client from the pool (e.g. when node config changes).
 */
export function removeXrayClient(nodeId: string): void {
  const client = pool.get(nodeId);
  if (client) {
    client.close();
    pool.delete(nodeId);
  }
}

/**
 * Close all pooled gRPC clients. Called on graceful shutdown.
 */
export function closeAllXrayClients(): void {
  for (const client of pool.values()) {
    client.close();
  }
  pool.clear();
}
