import type { Command } from "./node";

export const commands: Command[] = [
  {
    name: "check",
    description: "Check node health status",
    positional: "[node-id]",
    flags: {},
    run: (client, args) =>
      args["node-id"]
        ? client.get(`/health?node_id=${args["node-id"]}`)
        : client.get("/health"),
  },
];
