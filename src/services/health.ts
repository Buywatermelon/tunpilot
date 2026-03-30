import type { Db } from "../db/index";
import { listNodes } from "./node";
import { pingHysteriaStats } from "./hysteria/stats";

export interface NodeHealthStatus {
  id: string;
  name: string;
  status: string;
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

      // Xray/trojan nodes: attempt gRPC stats ping
      if ((node.protocol === "trojan" || node.protocol === "xray") && node.stats_port) {
        const baseUrl = `http://${node.host}:${node.stats_port}`;
        const status = await fetch(baseUrl, { signal: AbortSignal.timeout(5_000) })
          .then(() => "online")
          .catch(() => "offline");
        return { id: node.id, name: node.name, status };
      }

      return { id: node.id, name: node.name, status: "unknown" };
    })
  );

  return results;
}
