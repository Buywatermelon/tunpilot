import type { ApiClient } from "../client";

export interface Command {
  name: string;
  description: string;
  flags?: Record<string, { description: string; required?: boolean }>;
  positional?: string;
  run(client: ApiClient, args: Record<string, string | undefined>): Promise<unknown>;
}

export const commands: Command[] = [
  {
    name: "list",
    description: "List all nodes",
    run: (client) => client.get("/nodes"),
  },
  {
    name: "add",
    description: "Add a new node",
    flags: {
      name: { description: "Node name", required: true },
      host: { description: "Node host address", required: true },
      port: { description: "Node port", required: true },
      protocol: { description: "Protocol (hysteria2 or trojan)", required: true },
      stats_port: { description: "Stats API port" },
      stats_secret: { description: "Stats API secret" },
      sni: { description: "TLS SNI" },
      cert_path: { description: "Certificate path on node" },
      ssh_user: { description: "SSH user" },
      ssh_port: { description: "SSH port" },
      ssh_alias: { description: "SSH config alias" },
      insecure: { description: "Skip TLS verification (0 or 1)" },
      cert_fingerprint: { description: "Certificate SHA-256 fingerprint" },
    },
    run: (client, args) => {
      const body: Record<string, unknown> = { ...args };
      if (body.port) body.port = Number(body.port);
      if (body.stats_port) body.stats_port = Number(body.stats_port);
      if (body.ssh_port) body.ssh_port = Number(body.ssh_port);
      if (body.insecure) body.insecure = Number(body.insecure);
      return client.post("/nodes", body);
    },
  },
  {
    name: "update",
    description: "Update a node",
    positional: "id",
    flags: {
      name: { description: "Node name" },
      host: { description: "Node host address" },
      port: { description: "Node port" },
      protocol: { description: "Protocol" },
      stats_port: { description: "Stats API port" },
      stats_secret: { description: "Stats API secret" },
      sni: { description: "TLS SNI" },
      insecure: { description: "Skip TLS verification (0 or 1)" },
    },
    run: (client, args) => {
      const { id, ...rest } = args;
      const body: Record<string, unknown> = { ...rest };
      if (body.port) body.port = Number(body.port);
      if (body.stats_port) body.stats_port = Number(body.stats_port);
      if (body.insecure) body.insecure = Number(body.insecure);
      return client.patch(`/nodes/${id}`, body);
    },
  },
  {
    name: "remove",
    description: "Remove a node",
    positional: "id",
    run: (client, args) => client.del(`/nodes/${args.id}`),
  },
  {
    name: "sync",
    description: "Sync node configurations",
    positional: "[id]",
    run: (client, args) =>
      args.id ? client.post(`/nodes/${args.id}/sync`) : client.post("/nodes/sync"),
  },
];
