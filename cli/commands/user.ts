import type { Command } from "./node";

export const commands: Command[] = [
  {
    name: "list",
    description: "List all users",
    run: (client) => client.get("/users"),
  },
  {
    name: "create",
    description: "Create a new user",
    flags: {
      name: { description: "Username", required: true },
      password: { description: "User password", required: true },
      quota_bytes: { description: "Traffic quota in bytes" },
      max_devices: { description: "Maximum concurrent devices" },
      expire_at: { description: "Expiration date (ISO 8601)" },
      nodes: { description: "Node IDs (comma-separated) or 'all'" },
      subscribe: { description: "Auto-generate subscription (format: surge, clash, singbox, shadowrocket)" },
    },
    run: async (client, args) => {
      const { nodes: nodesArg, subscribe, quota_bytes, max_devices, ...rest } = args;
      const body: Record<string, unknown> = { ...rest };
      if (quota_bytes) body.quota_bytes = Number(quota_bytes);
      if (max_devices) body.max_devices = Number(max_devices);
      if (nodesArg) body.nodes = nodesArg === "all" ? "all" : nodesArg!.split(",");
      if (subscribe) body.subscribe = subscribe;
      return client.post("/users", body);
    },
  },
  {
    name: "update",
    description: "Update a user",
    positional: "id",
    flags: {
      name: { description: "Username" },
      password: { description: "User password" },
      quota_bytes: { description: "Traffic quota in bytes" },
      max_devices: { description: "Maximum concurrent devices" },
      expire_at: { description: "Expiration date (ISO 8601)" },
      nodes: { description: "Node IDs (comma-separated) to assign" },
    },
    run: async (client, args) => {
      const { id, nodes: nodesArg, quota_bytes, max_devices, ...rest } = args;
      const updateBody: Record<string, unknown> = { ...rest };
      if (quota_bytes) updateBody.quota_bytes = Number(quota_bytes);
      if (max_devices) updateBody.max_devices = Number(max_devices);

      const results: unknown[] = [];
      if (Object.keys(updateBody).length > 0) {
        results.push(await client.patch(`/users/${id}`, updateBody));
      }
      if (nodesArg) {
        const nodeIds = nodesArg!.split(",");
        results.push(await client.put(`/users/${id}/nodes`, { node_ids: nodeIds }));
      }
      return results.length === 1 ? results[0] : results;
    },
  },
  {
    name: "delete",
    description: "Delete a user",
    positional: "id",
    run: (client, args) => client.del(`/users/${args.id}`),
  },
  {
    name: "reset-traffic",
    description: "Reset traffic counters for a user",
    positional: "id",
    run: (client, args) => client.post(`/users/${args.id}/reset-traffic`),
  },
];
