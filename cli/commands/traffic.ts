import type { Command } from "./node";

export const commands: Command[] = [
  {
    name: "query",
    description: "Query traffic statistics",
    flags: {
      user: { description: "Filter by user ID" },
      node: { description: "Filter by node ID" },
      from: { description: "Start date (ISO 8601)" },
      to: { description: "End date (ISO 8601)" },
    },
    run: (client, args) => {
      const params = new URLSearchParams();
      if (args.user) params.set("user_id", args.user);
      if (args.node) params.set("node_id", args.node);
      if (args.from) params.set("from", args.from);
      if (args.to) params.set("to", args.to);
      const qs = params.toString();
      return client.get(`/traffic${qs ? `?${qs}` : ""}`);
    },
  },
];
