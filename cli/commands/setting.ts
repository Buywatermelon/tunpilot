import type { Command } from "./node";

export const commands: Command[] = [
  {
    name: "list",
    description: "List all settings",
    run: (client) => client.get("/settings"),
  },
  {
    name: "set",
    description: "Set a setting value (omit value to delete)",
    positional: "key [value]",
    run: (client, args) =>
      args.value
        ? client.put(`/settings/${args.key}`, { value: args.value })
        : client.del(`/settings/${args.key}`),
  },
];
