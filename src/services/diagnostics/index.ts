import type { Db } from "../../db/index";
import { getSetting } from "../settings";

// --- Interfaces ---

export interface DiagnosticParams {
  ip: string;
  port?: number;
  target?: string;
  options?: Record<string, unknown>;
}

export interface DiagnosticResult {
  provider: string;
  category: string;
  skipped: boolean;
  skipReason?: string;
  data: Record<string, unknown>;
  duration_ms: number;
}

export type DiagnosticCategory = "ip_info" | "ip_quality" | "route" | "connectivity";

export interface DiagnosticProvider {
  name: string;
  category: DiagnosticCategory;
  settingKey: string | null;
  run(params: DiagnosticParams, apiKey?: string): Promise<DiagnosticResult>;
}

// --- Registry ---

const registry = new Map<string, DiagnosticProvider>();

export function registerProvider(provider: DiagnosticProvider): void {
  registry.set(provider.name, provider);
}

export function getProviders(category?: DiagnosticCategory): DiagnosticProvider[] {
  const all = [...registry.values()];
  return category ? all.filter(p => p.category === category) : all;
}

export function resetRegistry(): void {
  registry.clear();
}

// --- Execution ---

export async function runProvider(
  db: Db,
  providerName: string,
  params: DiagnosticParams
): Promise<DiagnosticResult> {
  const provider = registry.get(providerName);
  if (!provider) {
    return {
      provider: providerName, category: "unknown" as DiagnosticCategory,
      skipped: true, skipReason: `Provider "${providerName}" not found`,
      data: {}, duration_ms: 0,
    };
  }

  // Check API key
  if (provider.settingKey) {
    const apiKey = getSetting(db, provider.settingKey);
    if (!apiKey) {
      return {
        provider: provider.name, category: provider.category,
        skipped: true, skipReason: `API key not configured (${provider.settingKey})`,
        data: {}, duration_ms: 0,
      };
    }
    try {
      const start = performance.now();
      const result = await provider.run(params, apiKey);
      result.duration_ms = Math.round(performance.now() - start);
      return result;
    } catch (err) {
      return {
        provider: provider.name, category: provider.category,
        skipped: true, skipReason: `Error: ${err instanceof Error ? err.message : String(err)}`,
        data: {}, duration_ms: 0,
      };
    }
  }

  try {
    const start = performance.now();
    const result = await provider.run(params);
    result.duration_ms = Math.round(performance.now() - start);
    return result;
  } catch (err) {
    return {
      provider: provider.name, category: provider.category,
      skipped: true, skipReason: `Error: ${err instanceof Error ? err.message : String(err)}`,
      data: {}, duration_ms: 0,
    };
  }
}

export async function runProvidersByCategory(
  db: Db,
  category: DiagnosticCategory,
  params: DiagnosticParams
): Promise<DiagnosticResult[]> {
  const providers = getProviders(category);
  return Promise.all(providers.map(p => runProvider(db, p.name, params)));
}
