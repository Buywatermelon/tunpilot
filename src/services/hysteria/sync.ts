import { eq, and } from "drizzle-orm";
import { parse, stringify } from "yaml";
import type { Db } from "../../db/index";
import { nodes, users, type Node, type User } from "../../db/schema";
import { sshExec, sshWriteFile, shellQuote } from "../xray/ssh";
import { needsTunnel } from "../xray/tunnel";
import { isCallAllowed, recordSuccess, recordFailure } from "../../lib/circuit-breaker";
import {
  type SyncError,
  type ReconcileResult,
  getNodeActiveUsers,
  getUserNodesByProtocol,
  getEnabledNodesByProtocol,
  withNodeLock,
  deployNodes,
  reconcileNodes,
} from "../sync-utils";

export type { SyncError, ReconcileResult };

const DEFAULT_CONFIG_PATHS = [
  "/etc/hysteria/config.yaml",
  "/etc/hysteria/config.yml",
  "/usr/local/etc/hysteria/config.yaml",
  "/usr/local/etc/hysteria/config.yml",
];

const HYSTERIA_RELOAD_COMMAND = [
  "sudo systemctl reload hysteria-server",
  "sudo systemctl restart hysteria-server",
  "sudo systemctl reload hysteria2",
  "sudo systemctl restart hysteria2",
  "sudo systemctl reload hysteria",
  "sudo systemctl restart hysteria",
].join(" || ");

interface HysteriaConfig {
  auth?: {
    type?: string;
    userpass?: Record<string, string>;
    [key: string]: unknown;
  };
  trafficStats?: {
    listen?: string;
    secret?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function getDesiredUsersMap(activeUsers: User[]): Record<string, string> {
  return Object.fromEntries(
    activeUsers
      .map((user) => [user.name, user.password] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function getDesiredStatsListen(node: Node): string | null {
  if (!node.stats_port || !node.stats_secret) return null;
  return needsTunnel(node) ? `127.0.0.1:${node.stats_port}` : `:${node.stats_port}`;
}

function getCurrentUsersMap(config: HysteriaConfig): Record<string, string> {
  const userpass = config.auth?.userpass;
  if (!userpass) return {};
  return Object.fromEntries(
    Object.entries(userpass).sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function resolveConfigPath(node: Node): Promise<string> {
  if (node.config_path) return node.config_path;

  for (const candidate of DEFAULT_CONFIG_PATHS) {
    try {
      await sshExec(node, `test -f ${shellQuote(candidate)}`);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(`No hysteria config found for node ${node.name}`);
}

export function getUserHysteriaNodes(db: Db, userId: string): Node[] {
  return getUserNodesByProtocol(db, userId, "hysteria2");
}

export async function deployNodeUsers(db: Db, node: Node): Promise<ReconcileResult> {
  return withNodeLock(node.id, async () => {
    const result: ReconcileResult = {
      nodeId: node.id,
      nodeName: node.name,
      added: 0,
      removed: 0,
      errors: [],
    };

    if (!node.ssh_user && !node.ssh_alias) {
      result.errors.push("Node has no SSH config (ssh_user or ssh_alias required)");
      return result;
    }

    const circuitKey = `hysteria:${node.id}`;
    if (!isCallAllowed(circuitKey)) {
      result.errors.push(`Circuit open for node ${node.name}, skipping deploy`);
      return result;
    }

    try {
      const activeUsers = getNodeActiveUsers(db, node.id);
      const desiredUsers = getDesiredUsersMap(activeUsers);
      const configPath = await resolveConfigPath(node);
      const rawConfig = await sshExec(node, `cat ${shellQuote(configPath)}`);
      const parsed = parse(rawConfig);

      if (!parsed || typeof parsed !== "object") {
        throw new Error(`Invalid YAML config for node ${node.name}`);
      }

      const config = parsed as HysteriaConfig;
      const currentUsers = getCurrentUsersMap(config);
      const desiredStatsListen = getDesiredStatsListen(node);
      const currentStats = config.trafficStats;
      const statsUnchanged = !desiredStatsListen || (
        currentStats?.listen === desiredStatsListen &&
        currentStats?.secret === node.stats_secret
      );

      if (
        config.auth?.type === "userpass" &&
        JSON.stringify(currentUsers) === JSON.stringify(desiredUsers) &&
        statsUnchanged
      ) {
        result.added = Object.keys(desiredUsers).length;
        recordSuccess(circuitKey);
        return result;
      }

      config.auth = {
        type: "userpass",
        userpass: desiredUsers,
      };

      if (desiredStatsListen && node.stats_secret) {
        config.trafficStats = {
          ...(config.trafficStats ?? {}),
          listen: desiredStatsListen,
          secret: node.stats_secret,
        };
      }

      await sshWriteFile(node, configPath, stringify(config));
      await sshExec(node, HYSTERIA_RELOAD_COMMAND);

      result.added = Object.keys(desiredUsers).length;
      recordSuccess(circuitKey);
    } catch (err: any) {
      recordFailure(circuitKey);
      result.errors.push(err.message);
    }

    return result;
  });
}

export async function syncUserToHysteriaNodes(db: Db, userId: string): Promise<SyncError[]> {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return [];

  const hy2Nodes = getUserHysteriaNodes(db, userId);
  if (hy2Nodes.length === 0) return [];

  return deployNodes(hy2Nodes, (node) => deployNodeUsers(db, node));
}

export async function syncHysteriaNodes(db: Db, nodeIds: string[]): Promise<SyncError[]> {
  const hy2Nodes = nodeIds
    .map((id) => db.select().from(nodes).where(and(eq(nodes.id, id), eq(nodes.protocol, "hysteria2"))).get())
    .filter((n): n is Node => n !== undefined);

  return deployNodes(hy2Nodes, (node) => deployNodeUsers(db, node));
}

export async function reconcileHysteriaNode(db: Db, node: Node): Promise<ReconcileResult> {
  return deployNodeUsers(db, node);
}

export async function reconcileAllHysteriaNodes(db: Db): Promise<ReconcileResult[]> {
  const hy2Nodes = getEnabledNodesByProtocol(db, "hysteria2");
  return reconcileNodes(hy2Nodes, (node) => deployNodeUsers(db, node));
}
