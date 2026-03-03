import { describe, test, expect, beforeEach, mock } from "bun:test";
import { initDatabase, type Db } from "../../db/index";
import {
  registerProvider,
  getProviders,
  runProvider,
  runProvidersByCategory,
  resetRegistry,
  type DiagnosticProvider,
  type DiagnosticParams,
} from "./index";

let db: Db;

beforeEach(() => {
  db = initDatabase(":memory:");
  resetRegistry();
});

describe("diagnostics registry", () => {
  test("registerProvider and getProviders", () => {
    const provider: DiagnosticProvider = {
      name: "test",
      category: "connectivity",
      settingKey: null,
      run: async () => ({ provider: "test", category: "connectivity", skipped: false, data: {}, duration_ms: 0 }),
    };
    registerProvider(provider);
    expect(getProviders()).toHaveLength(1);
    expect(getProviders("connectivity")).toHaveLength(1);
    expect(getProviders("ip_info")).toHaveLength(0);
  });

  test("runProvider skips when API key missing", async () => {
    const provider: DiagnosticProvider = {
      name: "needs-key",
      category: "ip_info",
      settingKey: "some_key",
      run: async () => ({ provider: "needs-key", category: "ip_info", skipped: false, data: { works: true }, duration_ms: 0 }),
    };
    registerProvider(provider);

    const result = await runProvider(db, "needs-key", { ip: "1.1.1.1" });
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain("some_key");
  });

  test("runProvider executes when API key present", async () => {
    const provider: DiagnosticProvider = {
      name: "has-key",
      category: "ip_info",
      settingKey: "test_key",
      run: async (_params, apiKey) => ({
        provider: "has-key", category: "ip_info", skipped: false,
        data: { key_received: apiKey },
        duration_ms: 1,
      }),
    };
    registerProvider(provider);

    // Set the API key in DB
    const { setSetting } = await import("../settings");
    setSetting(db, "test_key", "my_secret");

    const result = await runProvider(db, "has-key", { ip: "1.1.1.1" });
    expect(result.skipped).toBe(false);
    expect(result.data.key_received).toBe("my_secret");
  });

  test("runProvidersByCategory runs all providers in parallel", async () => {
    const p1: DiagnosticProvider = {
      name: "p1", category: "ip_quality", settingKey: null,
      run: async () => ({ provider: "p1", category: "ip_quality", skipped: false, data: { score: 10 }, duration_ms: 1 }),
    };
    const p2: DiagnosticProvider = {
      name: "p2", category: "ip_quality", settingKey: null,
      run: async () => ({ provider: "p2", category: "ip_quality", skipped: false, data: { score: 20 }, duration_ms: 1 }),
    };
    registerProvider(p1);
    registerProvider(p2);

    const results = await runProvidersByCategory(db, "ip_quality", { ip: "1.1.1.1" });
    expect(results).toHaveLength(2);
  });

  test("runProvider catches errors and returns skipped result", async () => {
    const provider: DiagnosticProvider = {
      name: "broken",
      category: "ip_info",
      settingKey: null,
      run: async () => { throw new Error("API timeout"); },
    };
    registerProvider(provider);

    const result = await runProvider(db, "broken", { ip: "1.1.1.1" });
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain("API timeout");
  });
});
