import type { Command } from "./commands/node";
import { createClient } from "./client";
import { getConfigValue, setConfigValue } from "./config";
import { commands as nodeCommands } from "./commands/node";
import { commands as userCommands } from "./commands/user";
import { commands as subCommands } from "./commands/sub";
import { commands as healthCommands } from "./commands/health";
import { commands as trafficCommands } from "./commands/traffic";
import { commands as settingCommands } from "./commands/setting";

interface ResourceGroup {
  name: string;
  description: string;
  commands: Command[];
}

const resources: ResourceGroup[] = [
  { name: "node", description: "Manage proxy nodes", commands: nodeCommands },
  { name: "user", description: "Manage users", commands: userCommands },
  { name: "sub", description: "Manage subscriptions", commands: subCommands },
  { name: "health", description: "Check node health", commands: healthCommands },
  { name: "traffic", description: "Query traffic statistics", commands: trafficCommands },
  { name: "setting", description: "Manage server settings", commands: settingCommands },
];

function printHelp(): void {
  const lines = [
    "tunpilot <resource> <action> [flags]",
    "",
    "Resources:",
  ];
  for (const r of resources) {
    lines.push(`  ${r.name.padEnd(12)} ${r.description}`);
  }
  lines.push(`  ${"config".padEnd(12)} Manage CLI configuration`);
  lines.push("");
  lines.push("Flags:");
  lines.push("  --help       Show help for a resource or command");
  lines.push("");
  lines.push("Examples:");
  lines.push("  tunpilot node list");
  lines.push("  tunpilot user create --name=alice --password=secret");
  lines.push("  tunpilot config set server http://1.2.3.4:3000");
  process.stdout.write(lines.join("\n") + "\n");
}

function printResourceHelp(group: ResourceGroup): void {
  const lines = [
    `tunpilot ${group.name} <action> [flags]`,
    "",
    `${group.description}`,
    "",
    "Actions:",
  ];
  for (const cmd of group.commands) {
    const pos = cmd.positional ? ` <${cmd.positional}>` : "";
    lines.push(`  ${(cmd.name + pos).padEnd(24)} ${cmd.description}`);
  }
  process.stdout.write(lines.join("\n") + "\n");
}

function printCommandHelp(group: ResourceGroup, cmd: Command): void {
  const pos = cmd.positional ? ` ${cmd.positional}` : "";
  const action = cmd.name ? ` ${cmd.name}` : "";
  const lines = [
    `tunpilot ${group.name}${action}${pos}`,
    "",
    cmd.description,
  ];
  if (cmd.flags && Object.keys(cmd.flags).length > 0) {
    lines.push("");
    lines.push("Flags:");
    for (const [flag, meta] of Object.entries(cmd.flags)) {
      const req = meta.required ? " (required)" : "";
      lines.push(`  --${flag.padEnd(20)} ${meta.description}${req}`);
    }
  }
  process.stdout.write(lines.join("\n") + "\n");
}

function printConfigHelp(): void {
  const lines = [
    "tunpilot config <action> [args]",
    "",
    "Manage CLI configuration",
    "",
    "Actions:",
    "  set <key> <value>      Set a config value (server, token)",
    "  get <key>              Get a config value",
  ];
  process.stdout.write(lines.join("\n") + "\n");
}

function parseArgs(argv: string[]): { positionals: string[]; flags: Record<string, string | undefined> } {
  const positionals: string[] = [];
  const flags: Record<string, string | undefined> = {};

  for (const arg of argv) {
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        flags[arg.slice(2)] = undefined;
      }
    } else {
      positionals.push(arg);
    }
  }

  return { positionals, flags };
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const { positionals, flags } = parseArgs(rawArgs);

  const hasHelp = "help" in flags;

  if (positionals.length === 0 || (hasHelp && positionals.length === 0)) {
    printHelp();
    return;
  }

  const resourceName = positionals[0]!;

  // Handle config as a special case (no API client needed)
  if (resourceName === "config") {
    if (hasHelp || positionals.length < 2) {
      printConfigHelp();
      return;
    }
    const action = positionals[1]!;
    if (action === "set" && positionals.length >= 4) {
      setConfigValue(positionals[2]!, positionals[3]!);
      process.stdout.write(JSON.stringify({ ok: true }) + "\n");
      return;
    }
    if (action === "get" && positionals.length >= 3) {
      const value = getConfigValue(positionals[2]!);
      process.stdout.write(JSON.stringify({ value: value ?? null }) + "\n");
      return;
    }
    printConfigHelp();
    return;
  }

  const group = resources.find((r) => r.name === resourceName);
  if (!group) {
    process.stderr.write(JSON.stringify({ error: `Unknown resource: ${resourceName}` }) + "\n");
    process.exit(1);
  }

  // Resource-level --help or no action
  if (hasHelp && positionals.length === 1) {
    if (group.commands.length === 1) {
      printCommandHelp(group, group.commands[0]!);
    } else {
      printResourceHelp(group);
    }
    return;
  }

  // Single-command groups (health, traffic): no action name, all positionals are args
  if (group.commands.length === 1 && group.commands[0]!.name === "") {
    const singleCmd = group.commands[0]!;
    if (hasHelp) {
      printCommandHelp(group, singleCmd);
      return;
    }
    const cmdArgs: Record<string, string | undefined> = { ...flags };
    delete cmdArgs.help;
    // First positional after resource name is the command's positional arg
    if (singleCmd.positional && positionals[1]) {
      const posName = singleCmd.positional.replace(/[\[\]]/g, "");
      cmdArgs[posName] = positionals[1];
    }
    const client = createClient();
    const result = await singleCmd.run(client, cmdArgs);
    if (result !== null && result !== undefined) {
      process.stdout.write(JSON.stringify(result) + "\n");
    }
    return;
  }

  let actionName = positionals[1];
  let positionalStart = 2;

  if (!actionName) {
    printResourceHelp(group);
    return;
  }

  const cmd = group.commands.find((c) => c.name === actionName);
  if (!cmd) {
    process.stderr.write(JSON.stringify({ error: `Unknown action: ${resourceName} ${actionName}` }) + "\n");
    process.exit(1);
  }

  if (hasHelp) {
    printCommandHelp(group, cmd);
    return;
  }

  // Build args for the command
  const cmdArgs: Record<string, string | undefined> = { ...flags };
  delete cmdArgs.help;

  // Parse positional arguments
  if (cmd.positional) {
    const posNames = cmd.positional.replace(/[\[\]]/g, "").split(" ");
    for (let i = 0; i < posNames.length && positionalStart + i < positionals.length; i++) {
      cmdArgs[posNames[i]!] = positionals[positionalStart + i];
    }
  }

  const client = createClient();
  const result = await cmd.run(client, cmdArgs);
  if (result !== null && result !== undefined) {
    process.stdout.write(JSON.stringify(result) + "\n");
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(JSON.stringify({ error: message }) + "\n");
  process.exit(1);
});
