import type { Command } from "./node";

export const commands: Command[] = [
  {
    name: "",
    description: "Check node health status",
    positional: "[node-id]",
    flags: {},
    run: (client, args) => {
      if (args["node-id"]) {
        const params = new URLSearchParams({ node_id: args["node-id"] });
        return client.get(`/health?${params}`);
      }
      return client.get("/health");
    },
  },
];
