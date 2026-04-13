import type { Db } from "../db/index";
import { listNodes } from "./node";
import { pingHysteriaStats } from "./hysteria/stats";
import { needsTunnel, ensureTunnel } from "./xray/tunnel";

export interface NodeHealthStatus {
  id: string;
  name: string;
  status: string;
}

/** Check if a TCP port accepts connections. */
async function tcpPing(host: string, port: number, timeoutMs = 5_000): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    try {
      const socket = Bun.connect({
        hostname: host,
        port,
        socket: {
          open(socket) {
            clearTimeout(timer);
            socket.end();
            resolve(true);
          },
          data() {},
          close() {},
          error() {
            clearTimeout(timer);
            resolve(false);
          },
        },
      });
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

export async function getNodeHealthStatuses(db: Db): Promise<NodeHealthStatus[]> {
  const allNodes = listNodes(db);

  const results = await Promise.all(
    allNodes.map(async (node): Promise<NodeHealthStatus> => {
      if (node.enabled !== 1) {
        return { id: node.id, name: node.name, status: "disabled" };
      }

      if (node.protocol === "hysteria2" && node.stats_port) {
        const status = await pingHysteriaStats(node).catch(() => "offline");
        return { id: node.id, name: node.name, status };
      }

      // Xray/trojan nodes: TCP ping via SSH tunnel (gRPC, not HTTP)
      if ((node.protocol === "trojan" || node.protocol === "xray") && node.stats_port) {
        try {
          let host = node.host;
          let port = node.stats_port;
          if (needsTunnel(node)) {
            port = await ensureTunnel(node);
            host = "127.0.0.1";
          }
          const online = await tcpPing(host, port);
          return { id: node.id, name: node.name, status: online ? "online" : "offline" };
        } catch {
          return { id: node.id, name: node.name, status: "offline" };
        }
      }

      return { id: node.id, name: node.name, status: "unknown" };
    })
  );

  return results;
}
