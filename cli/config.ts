import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync } from "fs";

export interface CliConfig {
  server?: string;
  token?: string;
}

const DEFAULT_CONFIG_PATH = join(homedir(), ".config", "tunpilot", "config.json");

function getConfigPath(): string {
  return process.env.TUNPILOT_CONFIG_PATH ?? DEFAULT_CONFIG_PATH;
}

export function loadConfig(): CliConfig {
  const path = getConfigPath();
  if (!existsSync(path)) return {};
  const content = readFileSync(path, "utf-8");
  if (!content.trim()) return {};
  return JSON.parse(content) as CliConfig;
}

export function saveConfig(config: CliConfig): void {
  const path = getConfigPath();
  const dir = path.substring(0, path.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });
  Bun.write(path, JSON.stringify(config, null, 2) + "\n");
}

export function getConfigValue(key: string): string | undefined {
  const config = loadConfig();
  return config[key as keyof CliConfig];
}

export function setConfigValue(key: string, value: string): void {
  const config = loadConfig();
  (config as Record<string, string>)[key] = value;
  saveConfig(config);
}
