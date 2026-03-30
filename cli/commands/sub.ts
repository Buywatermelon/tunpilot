import type { Command } from "./node";

export const commands: Command[] = [
  {
    name: "list",
    description: "List subscriptions",
    flags: {
      user: { description: "Filter by user ID" },
    },
    run: (client, args) =>
      args.user
        ? client.get(`/users/${args.user}/subscriptions`)
        : client.get("/subscriptions"),
  },
  {
    name: "create",
    description: "Create a subscription",
    flags: {
      user: { description: "User ID", required: true },
      format: { description: "Subscription format (surge, clash, singbox, shadowrocket)", required: true },
    },
    run: (client, args) =>
      client.post(`/users/${args.user}/subscriptions`, { format: args.format }),
  },
  {
    name: "delete",
    description: "Delete a subscription",
    positional: "id",
    run: (client, args) => client.del(`/subscriptions/${args.id}`),
  },
];
