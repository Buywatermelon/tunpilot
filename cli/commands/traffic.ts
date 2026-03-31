import type { Command } from "./node";

export const commands: Command[] = [
  {
    name: "",
    description: "Query traffic statistics",
    flags: {
      user: { description: "Filter by user ID" },
      node: { description: "Filter by node ID" },
      from: { description: "Start date (ISO 8601)" },
      to: { description: "End date (ISO 8601)" },
    },
    run: (client, args) => {
      const map: Record<string, string> = { user: "user_id", node: "node_id", from: "from", to: "to" };
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(map)) if (args[k]) params.set(v, args[k]!);
      const qs = params.toString();
      return client.get(`/traffic${qs ? `?${qs}` : ""}`);
    },
  },
];
