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
      const qs = Object.entries(map).filter(([k]) => args[k]).map(([k, v]) => `${v}=${args[k]}`).join("&");
      return client.get(`/traffic${qs ? `?${qs}` : ""}`);
    },
  },
];
