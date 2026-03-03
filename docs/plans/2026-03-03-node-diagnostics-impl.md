# Node Diagnostics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add IP info, IP quality, connectivity, and route testing to TunPilot via Provider Registry pattern with atomic MCP tools + skill orchestration.

**Architecture:** Provider Registry (mirrors existing Format Registry in `src/services/formats/`). Each external API is a provider implementing `DiagnosticProvider`. MCP tools call providers, skill orchestrates tools into reports. API keys stored in new `settings` DB table.

**Tech Stack:** Bun (fetch, TCP sockets), Drizzle ORM, Zod, MCP SDK. External APIs: IPinfo.io, Scamalytics, IPQS, AbuseIPDB, Globalping.

**Design doc:** `docs/plans/2026-03-03-node-diagnostics-design.md`

---

### Task 1: Settings table + service

**Files:**
- Modify: `src/db/schema.ts` (add `settings` table after line 69)
- Modify: `src/db/index.ts` (add CREATE TABLE + migration after line 94)
- Create: `src/services/settings.ts`
- Test: `src/services/settings.test.ts`

**Step 1: Write the failing test**

Create `src/services/settings.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { initDatabase, type Db } from "../db/index";
import { getSetting, setSetting, deleteSetting, listSettings } from "./settings";

let db: Db;

beforeEach(() => {
  db = initDatabase(":memory:");
});

describe("settings service", () => {
  test("setSetting creates a new setting", () => {
    setSetting(db, "ipinfo_token", "tok_abc123");
    const val = getSetting(db, "ipinfo_token");
    expect(val).toBe("tok_abc123");
  });

  test("setSetting updates existing setting", () => {
    setSetting(db, "ipinfo_token", "old");
    setSetting(db, "ipinfo_token", "new");
    expect(getSetting(db, "ipinfo_token")).toBe("new");
  });

  test("getSetting returns null for missing key", () => {
    expect(getSetting(db, "nonexistent")).toBeNull();
  });

  test("deleteSetting removes a setting", () => {
    setSetting(db, "ipinfo_token", "val");
    deleteSetting(db, "ipinfo_token");
    expect(getSetting(db, "ipinfo_token")).toBeNull();
  });

  test("listSettings returns all settings with masked values", () => {
    setSetting(db, "ipinfo_token", "tok_abcdef123");
    setSetting(db, "ipqs_key", "ab");
    const list = listSettings(db);
    expect(list).toHaveLength(2);
    const ipinfo = list.find(s => s.key === "ipinfo_token")!;
    expect(ipinfo.masked_value).toBe("tok_**********");
    const ipqs = list.find(s => s.key === "ipqs_key")!;
    expect(ipqs.masked_value).toBe("****");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/services/settings.test.ts`
Expected: FAIL — module `./settings` not found

**Step 3: Add settings table to schema**

In `src/db/schema.ts`, add after the `trafficLogs` table (after line 69):

```typescript
// 系统设置表（API Key 等）
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updated_at: text("updated_at").default(sql`(datetime('now'))`),
});

export type Setting = typeof settings.$inferSelect;
```

In `src/db/index.ts`, add CREATE TABLE after the traffic_logs table creation (after line 81):

```sql
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now'))
)
```

**Step 4: Write the settings service**

Create `src/services/settings.ts`:

```typescript
import { eq } from "drizzle-orm";
import type { Db } from "../db/index";
import { settings } from "../db/schema";
import { sql } from "drizzle-orm";

export function getSetting(db: Db, key: string): string | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updated_at: sql`(datetime('now'))` },
    })
    .run();
}

export function deleteSetting(db: Db, key: string): void {
  db.delete(settings).where(eq(settings.key, key)).run();
}

export function listSettings(db: Db): Array<{ key: string; masked_value: string; updated_at: string | null }> {
  const rows = db.select().from(settings).all();
  return rows.map(row => ({
    key: row.key,
    masked_value: row.value.length > 4
      ? row.value.slice(0, 4) + "*".repeat(row.value.length - 4)
      : "****",
    updated_at: row.updated_at,
  }));
}
```

**Step 5: Run test to verify it passes**

Run: `bun test src/services/settings.test.ts`
Expected: PASS (all 5 tests)

**Step 6: Commit**

```bash
git add src/db/schema.ts src/db/index.ts src/services/settings.ts src/services/settings.test.ts
git commit -m "feat: add settings table and service for API key storage"
```

---

### Task 2: Settings MCP tools

**Files:**
- Create: `src/mcp/tools/settings.ts`
- Modify: `src/mcp/index.ts` (register settings tools, line 6 + line 18)
- Test: `src/mcp/index.test.ts` (add settings test block)

**Step 1: Write the failing test**

Append to `src/mcp/index.test.ts` before the final line:

```typescript
// --- Settings ---

describe("settings tools", () => {
  beforeEach(setup);
  afterEach(async () => cleanup());

  test("set_setting and list_settings", async () => {
    await client.callTool({
      name: "set_setting",
      arguments: { key: "ipinfo_token", value: "tok_test123" },
    });

    const result = await client.callTool({ name: "list_settings", arguments: {} });
    const data = parseResult(result) as Array<{ key: string; masked_value: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.key).toBe("ipinfo_token");
    expect(data[0]!.masked_value).toBe("tok_*******");
  });

  test("delete_setting removes setting", async () => {
    await client.callTool({
      name: "set_setting",
      arguments: { key: "ipinfo_token", value: "tok_test123" },
    });
    await client.callTool({
      name: "delete_setting",
      arguments: { key: "ipinfo_token" },
    });

    const result = await client.callTool({ name: "list_settings", arguments: {} });
    const data = parseResult(result) as Array<unknown>;
    expect(data).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/mcp/index.test.ts --filter "settings"`
Expected: FAIL — tool `set_setting` not found

**Step 3: Write the settings MCP tools**

Create `src/mcp/tools/settings.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "../../db/index";
import { getSetting, setSetting, deleteSetting, listSettings } from "../../services/settings";

// 注册设置管理工具（3 个）：set_setting, list_settings, delete_setting
export function register(server: McpServer, db: Db, _baseUrl: string) {
  server.registerTool(
    "set_setting",
    {
      description: "Set a configuration value (e.g. API keys). Known keys: ipinfo_token, scamalytics_key, ipqs_key, globalping_token, abuseipdb_key",
      inputSchema: {
        key: z.string().describe("Setting key"),
        value: z.string().describe("Setting value"),
      },
    },
    async ({ key, value }) => {
      setSetting(db, key, value);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, key }) }] };
    }
  );

  server.registerTool(
    "list_settings",
    {
      description: "List all configured settings (values are masked for security)",
      inputSchema: {},
    },
    async () => {
      const list = listSettings(db);
      return { content: [{ type: "text", text: JSON.stringify(list) }] };
    }
  );

  server.registerTool(
    "delete_setting",
    {
      description: "Delete a configuration setting",
      inputSchema: {
        key: z.string().describe("Setting key to delete"),
      },
    },
    async ({ key }) => {
      deleteSetting(db, key);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, key }) }] };
    }
  );
}
```

**Step 4: Register in MCP index**

In `src/mcp/index.ts`, add import at line 6:

```typescript
import { register as registerSettings } from "./tools/settings";
```

Add registration call after line 18 (after `registerMonitoring`):

```typescript
  registerSettings(server, db, baseUrl);
```

**Step 5: Run test to verify it passes**

Run: `bun test src/mcp/index.test.ts --filter "settings"`
Expected: PASS (2 tests)

**Step 6: Run all existing tests to verify no regressions**

Run: `bun test`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/mcp/tools/settings.ts src/mcp/index.ts src/mcp/index.test.ts
git commit -m "feat: add settings MCP tools for API key management"
```

---

### Task 3: Diagnostics Provider Registry + connectivity provider

**Files:**
- Create: `src/services/diagnostics/index.ts`
- Create: `src/services/diagnostics/providers/connectivity.ts`
- Test: `src/services/diagnostics/index.test.ts`

**Step 1: Write the failing test**

Create `src/services/diagnostics/index.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `bun test src/services/diagnostics/index.test.ts`
Expected: FAIL — module `./index` not found

**Step 3: Write the registry**

Create `src/services/diagnostics/index.ts`:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `bun test src/services/diagnostics/index.test.ts`
Expected: PASS (5 tests)

**Step 5: Write the connectivity provider**

Create `src/services/diagnostics/providers/connectivity.ts`:

```typescript
import { registerProvider, type DiagnosticProvider, type DiagnosticParams, type DiagnosticResult } from "../index";

async function tcpHandshake(host: string, port: number, timeoutMs: number): Promise<{ reachable: boolean; latency_ms: number }> {
  const start = performance.now();
  try {
    const socket = await Bun.connect({
      hostname: host,
      port,
      socket: {
        data() {},
        open(socket) { socket.end(); },
        error() {},
        close() {},
      },
    });
    const latency = Math.round(performance.now() - start);
    return { reachable: true, latency_ms: latency };
  } catch {
    return { reachable: false, latency_ms: Math.round(performance.now() - start) };
  }
}

export const connectivity: DiagnosticProvider = {
  name: "connectivity",
  category: "connectivity",
  settingKey: null,

  async run(params: DiagnosticParams): Promise<DiagnosticResult> {
    const port = params.port || 443;
    const result = await tcpHandshake(params.ip, port, 5000);

    return {
      provider: "connectivity",
      category: "connectivity",
      skipped: false,
      data: {
        host: params.ip,
        port,
        reachable: result.reachable,
        handshake_ms: result.latency_ms,
      },
      duration_ms: 0,
    };
  },
};

registerProvider(connectivity);
```

**Step 6: Commit**

```bash
git add src/services/diagnostics/
git commit -m "feat: add diagnostics provider registry and connectivity provider"
```

---

### Task 4: IPinfo provider

**Files:**
- Create: `src/services/diagnostics/providers/ipinfo.ts`
- Test: `src/services/diagnostics/providers/ipinfo.test.ts`

**Step 1: Write the failing test**

Create `src/services/diagnostics/providers/ipinfo.test.ts`:

```typescript
import { describe, test, expect, beforeEach, mock } from "bun:test";
import { initDatabase, type Db } from "../../../db/index";
import { setSetting } from "../../settings";
import { resetRegistry, runProvider } from "../index";

let db: Db;

beforeEach(() => {
  db = initDatabase(":memory:");
  resetRegistry();
});

// Mock fetch for testing
const originalFetch = globalThis.fetch;

describe("ipinfo provider", () => {
  test("returns structured IP info on success", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      ip: "95.181.188.250",
      city: "Los Angeles",
      region: "California",
      country: "US",
      loc: "34.0522,-118.2437",
      org: "AS20473 The Constant Company, LLC",
      timezone: "America/Los_Angeles",
      privacy: { vpn: false, proxy: false, tor: false, relay: false, hosting: true },
    }))) as typeof fetch;

    // Import after mock to register provider
    await import("./ipinfo");
    setSetting(db, "ipinfo_token", "test_token");

    const result = await runProvider(db, "ipinfo", { ip: "95.181.188.250" });
    expect(result.skipped).toBe(false);
    expect(result.data.country).toBe("US");
    expect(result.data.city).toBe("Los Angeles");
    expect(result.data.asn).toBe("AS20473");

    globalThis.fetch = originalFetch;
  });

  test("skips when no API key configured", async () => {
    await import("./ipinfo");
    const result = await runProvider(db, "ipinfo", { ip: "1.1.1.1" });
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain("ipinfo_token");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/services/diagnostics/providers/ipinfo.test.ts`
Expected: FAIL — module not found

**Step 3: Write the ipinfo provider**

Create `src/services/diagnostics/providers/ipinfo.ts`:

```typescript
import { registerProvider, type DiagnosticProvider, type DiagnosticParams, type DiagnosticResult } from "../index";

function parseOrg(org: string | undefined): { asn: string; isp: string } {
  if (!org) return { asn: "", isp: "" };
  const match = org.match(/^(AS\d+)\s+(.+)$/);
  return match ? { asn: match[1]!, isp: match[2]! } : { asn: "", isp: org };
}

export const ipinfo: DiagnosticProvider = {
  name: "ipinfo",
  category: "ip_info",
  settingKey: "ipinfo_token",

  async run(params: DiagnosticParams, apiKey?: string): Promise<DiagnosticResult> {
    const res = await fetch(`https://ipinfo.io/${params.ip}?token=${apiKey}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`IPinfo API returned ${res.status}`);
    }

    const json = await res.json() as Record<string, unknown>;
    const { asn, isp } = parseOrg(json.org as string | undefined);
    const privacy = json.privacy as Record<string, boolean> | undefined;

    return {
      provider: "ipinfo",
      category: "ip_info",
      skipped: false,
      data: {
        ip: json.ip,
        city: json.city,
        region: json.region,
        country: json.country,
        loc: json.loc,
        asn,
        isp,
        timezone: json.timezone,
        privacy: privacy ?? {},
      },
      duration_ms: 0,
    };
  },
};

registerProvider(ipinfo);
```

**Step 4: Run test to verify it passes**

Run: `bun test src/services/diagnostics/providers/ipinfo.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add src/services/diagnostics/providers/ipinfo.ts src/services/diagnostics/providers/ipinfo.test.ts
git commit -m "feat: add ipinfo diagnostic provider"
```

---

### Task 5: Scamalytics provider

**Files:**
- Create: `src/services/diagnostics/providers/scamalytics.ts`
- Test: `src/services/diagnostics/providers/scamalytics.test.ts`

**Step 1: Write the failing test**

Create `src/services/diagnostics/providers/scamalytics.test.ts`:

```typescript
import { describe, test, expect, beforeEach, mock } from "bun:test";
import { initDatabase, type Db } from "../../../db/index";
import { setSetting } from "../../settings";
import { resetRegistry, runProvider } from "../index";

let db: Db;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  db = initDatabase(":memory:");
  resetRegistry();
});

describe("scamalytics provider", () => {
  test("returns fraud score on success", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      score: "23",
      risk: "low",
      "Anonymizing VPN": "No",
      "Tor Exit Node": "No",
      "Public Proxy": "No",
    }))) as typeof fetch;

    await import("./scamalytics");
    setSetting(db, "scamalytics_key", "test_key");

    const result = await runProvider(db, "scamalytics", { ip: "95.181.188.250" });
    expect(result.skipped).toBe(false);
    expect(result.data.score).toBe(23);
    expect(result.data.risk).toBe("low");

    globalThis.fetch = originalFetch;
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/services/diagnostics/providers/scamalytics.test.ts`
Expected: FAIL

**Step 3: Write the scamalytics provider**

Create `src/services/diagnostics/providers/scamalytics.ts`:

```typescript
import { registerProvider, type DiagnosticProvider, type DiagnosticParams, type DiagnosticResult } from "../index";

export const scamalytics: DiagnosticProvider = {
  name: "scamalytics",
  category: "ip_quality",
  settingKey: "scamalytics_key",

  async run(params: DiagnosticParams, apiKey?: string): Promise<DiagnosticResult> {
    const res = await fetch(
      `https://api11.scamalytics.com/${apiKey}/?ip=${params.ip}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) throw new Error(`Scamalytics API returned ${res.status}`);

    const json = await res.json() as Record<string, unknown>;

    return {
      provider: "scamalytics",
      category: "ip_quality",
      skipped: false,
      data: {
        score: Number(json.score) || 0,
        risk: json.risk,
        vpn: json["Anonymizing VPN"] === "Yes",
        tor: json["Tor Exit Node"] === "Yes",
        proxy: json["Public Proxy"] === "Yes",
      },
      duration_ms: 0,
    };
  },
};

registerProvider(scamalytics);
```

**Step 4: Run test to verify it passes**

Run: `bun test src/services/diagnostics/providers/scamalytics.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/diagnostics/providers/scamalytics.ts src/services/diagnostics/providers/scamalytics.test.ts
git commit -m "feat: add scamalytics diagnostic provider"
```

---

### Task 6: IPQS provider

**Files:**
- Create: `src/services/diagnostics/providers/ipqs.ts`
- Test: `src/services/diagnostics/providers/ipqs.test.ts`

**Step 1: Write the failing test**

Create `src/services/diagnostics/providers/ipqs.test.ts`:

```typescript
import { describe, test, expect, beforeEach, mock } from "bun:test";
import { initDatabase, type Db } from "../../../db/index";
import { setSetting } from "../../settings";
import { resetRegistry, runProvider } from "../index";

let db: Db;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  db = initDatabase(":memory:");
  resetRegistry();
});

describe("ipqs provider", () => {
  test("returns fraud analysis on success", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      success: true,
      fraud_score: 15,
      vpn: false,
      proxy: false,
      tor: false,
      bot_status: false,
      recent_abuse: false,
      ISP: "The Constant Company",
      connection_type: "Data Center",
      country_code: "US",
    }))) as typeof fetch;

    await import("./ipqs");
    setSetting(db, "ipqs_key", "test_key");

    const result = await runProvider(db, "ipqs", { ip: "95.181.188.250" });
    expect(result.skipped).toBe(false);
    expect(result.data.fraud_score).toBe(15);
    expect(result.data.vpn).toBe(false);
    expect(result.data.connection_type).toBe("Data Center");

    globalThis.fetch = originalFetch;
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/services/diagnostics/providers/ipqs.test.ts`
Expected: FAIL

**Step 3: Write the IPQS provider**

Create `src/services/diagnostics/providers/ipqs.ts`:

```typescript
import { registerProvider, type DiagnosticProvider, type DiagnosticParams, type DiagnosticResult } from "../index";

export const ipqs: DiagnosticProvider = {
  name: "ipqs",
  category: "ip_quality",
  settingKey: "ipqs_key",

  async run(params: DiagnosticParams, apiKey?: string): Promise<DiagnosticResult> {
    const res = await fetch(
      `https://ipqualityscore.com/api/json/ip/${apiKey}/${params.ip}?strictness=1&allow_public_access_points=true`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) throw new Error(`IPQS API returned ${res.status}`);

    const json = await res.json() as Record<string, unknown>;
    if (!json.success) throw new Error(`IPQS error: ${json.message}`);

    return {
      provider: "ipqs",
      category: "ip_quality",
      skipped: false,
      data: {
        fraud_score: json.fraud_score,
        vpn: json.vpn,
        proxy: json.proxy,
        tor: json.tor,
        bot: json.bot_status,
        recent_abuse: json.recent_abuse,
        isp: json.ISP,
        connection_type: json.connection_type,
        country: json.country_code,
      },
      duration_ms: 0,
    };
  },
};

registerProvider(ipqs);
```

**Step 4: Run test to verify it passes**

Run: `bun test src/services/diagnostics/providers/ipqs.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/diagnostics/providers/ipqs.ts src/services/diagnostics/providers/ipqs.test.ts
git commit -m "feat: add IPQS diagnostic provider"
```

---

### Task 7: AbuseIPDB provider

**Files:**
- Create: `src/services/diagnostics/providers/abuseipdb.ts`
- Test: `src/services/diagnostics/providers/abuseipdb.test.ts`

**Step 1: Write the failing test**

Create `src/services/diagnostics/providers/abuseipdb.test.ts`:

```typescript
import { describe, test, expect, beforeEach, mock } from "bun:test";
import { initDatabase, type Db } from "../../../db/index";
import { setSetting } from "../../settings";
import { resetRegistry, runProvider } from "../index";

let db: Db;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  db = initDatabase(":memory:");
  resetRegistry();
});

describe("abuseipdb provider", () => {
  test("returns abuse confidence score on success", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      data: {
        abuseConfidenceScore: 5,
        totalReports: 2,
        lastReportedAt: "2026-02-15T10:00:00Z",
        usageType: "Data Center/Web Hosting/Transit",
        isp: "The Constant Company",
        countryCode: "US",
      },
    }))) as typeof fetch;

    await import("./abuseipdb");
    setSetting(db, "abuseipdb_key", "test_key");

    const result = await runProvider(db, "abuseipdb", { ip: "95.181.188.250" });
    expect(result.skipped).toBe(false);
    expect(result.data.abuse_confidence).toBe(5);
    expect(result.data.total_reports).toBe(2);
    expect(result.data.usage_type).toBe("Data Center/Web Hosting/Transit");

    globalThis.fetch = originalFetch;
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/services/diagnostics/providers/abuseipdb.test.ts`
Expected: FAIL

**Step 3: Write the AbuseIPDB provider**

Create `src/services/diagnostics/providers/abuseipdb.ts`:

```typescript
import { registerProvider, type DiagnosticProvider, type DiagnosticParams, type DiagnosticResult } from "../index";

export const abuseipdb: DiagnosticProvider = {
  name: "abuseipdb",
  category: "ip_quality",
  settingKey: "abuseipdb_key",

  async run(params: DiagnosticParams, apiKey?: string): Promise<DiagnosticResult> {
    const res = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${params.ip}&maxAgeInDays=90`,
      {
        headers: { Key: apiKey!, Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) throw new Error(`AbuseIPDB API returned ${res.status}`);

    const json = await res.json() as { data: Record<string, unknown> };
    const d = json.data;

    return {
      provider: "abuseipdb",
      category: "ip_quality",
      skipped: false,
      data: {
        abuse_confidence: d.abuseConfidenceScore,
        total_reports: d.totalReports,
        last_reported: d.lastReportedAt,
        usage_type: d.usageType,
        isp: d.isp,
        country: d.countryCode,
      },
      duration_ms: 0,
    };
  },
};

registerProvider(abuseipdb);
```

**Step 4: Run test to verify it passes**

Run: `bun test src/services/diagnostics/providers/abuseipdb.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/diagnostics/providers/abuseipdb.ts src/services/diagnostics/providers/abuseipdb.test.ts
git commit -m "feat: add AbuseIPDB diagnostic provider"
```

---

### Task 8: Globalping provider

**Files:**
- Create: `src/services/diagnostics/providers/globalping.ts`
- Test: `src/services/diagnostics/providers/globalping.test.ts`

**Step 1: Write the failing test**

Create `src/services/diagnostics/providers/globalping.test.ts`:

```typescript
import { describe, test, expect, beforeEach, mock } from "bun:test";
import { initDatabase, type Db } from "../../../db/index";
import { setSetting } from "../../settings";
import { resetRegistry, runProvider } from "../index";

let db: Db;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  db = initDatabase(":memory:");
  resetRegistry();
});

describe("globalping provider", () => {
  test("returns ping results on success", async () => {
    // Globalping uses POST to create measurement, then GET to poll results
    let callCount = 0;
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes("/v1/measurements") && callCount === 0) {
        callCount++;
        return new Response(JSON.stringify({ id: "meas-123" }), { status: 202 });
      }
      // Poll result
      return new Response(JSON.stringify({
        status: "finished",
        results: [{
          result: {
            status: "finished",
            stats: { min: 150.1, avg: 168.3, max: 195.2, loss: 0, rcv: 3, drop: 0 },
            timings: [{ rtt: 150.1 }, { rtt: 168.3 }, { rtt: 195.2 }],
          },
          probe: { continent: "AS", country: "CN", city: "Beijing", asn: 4134, network: "ChinaNet" },
        }],
      }));
    }) as typeof fetch;

    await import("./globalping");
    setSetting(db, "globalping_token", "test_token");

    const result = await runProvider(db, "globalping", {
      ip: "95.181.188.250",
      target: "Beijing, CN",
    });
    expect(result.skipped).toBe(false);
    expect(result.data.latency_avg).toBe(168.3);
    expect(result.data.packet_loss).toBe(0);

    globalThis.fetch = originalFetch;
  });

  test("works without API token (unauthenticated)", async () => {
    resetRegistry();
    // Re-import to re-register
    // Globalping allows anonymous access with lower rate limits
    // settingKey is "globalping_token" but the provider should handle null token
    await import("./globalping");

    // Without token set, it should be skipped due to settingKey check
    const result = await runProvider(db, "globalping", { ip: "1.1.1.1" });
    expect(result.skipped).toBe(true);

    globalThis.fetch = originalFetch;
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/services/diagnostics/providers/globalping.test.ts`
Expected: FAIL

**Step 3: Write the Globalping provider**

Create `src/services/diagnostics/providers/globalping.ts`:

```typescript
import { registerProvider, type DiagnosticProvider, type DiagnosticParams, type DiagnosticResult } from "../index";

async function pollMeasurement(id: string, apiKey: string, timeoutMs: number = 30000): Promise<Record<string, unknown>> {
  const start = Date.now();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`https://api.globalping.io/v1/measurements/${id}`, { headers });
    if (!res.ok) throw new Error(`Globalping poll returned ${res.status}`);
    const json = await res.json() as Record<string, unknown>;
    if (json.status === "finished") return json;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error("Globalping measurement timed out");
}

function parseLocation(target: string): { country?: string; city?: string } {
  // Parse "Beijing, CN" or "Tokyo, JP" format
  const parts = target.split(",").map(s => s.trim());
  if (parts.length === 2) return { city: parts[0], country: parts[1] };
  if (parts.length === 1) return { country: parts[0] };
  return {};
}

export const globalping: DiagnosticProvider = {
  name: "globalping",
  category: "route",
  settingKey: "globalping_token",

  async run(params: DiagnosticParams, apiKey?: string): Promise<DiagnosticResult> {
    const target = params.target || "Beijing, CN";
    const location = parseLocation(target);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    // Create measurement
    const createRes = await fetch("https://api.globalping.io/v1/measurements", {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "ping",
        target: params.ip,
        locations: [{ country: location.country, city: location.city }],
        measurementOptions: { packets: 5 },
        limit: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!createRes.ok) {
      const body = await createRes.text();
      throw new Error(`Globalping create returned ${createRes.status}: ${body}`);
    }

    const { id } = await createRes.json() as { id: string };
    const measurement = await pollMeasurement(id, apiKey || "");

    const results = measurement.results as Array<{
      result: { stats: Record<string, number> };
      probe: Record<string, unknown>;
    }>;

    if (!results || results.length === 0) {
      throw new Error("No results from Globalping");
    }

    const first = results[0]!;
    const stats = first.result.stats;

    return {
      provider: "globalping",
      category: "route",
      skipped: false,
      data: {
        from: target,
        probe_location: `${first.probe.city}, ${first.probe.country}`,
        probe_network: first.probe.network,
        probe_asn: first.probe.asn,
        latency_min: stats.min,
        latency_avg: stats.avg,
        latency_max: stats.max,
        packet_loss: stats.loss ?? stats.drop ?? 0,
        packets_received: stats.rcv,
      },
      duration_ms: 0,
    };
  },
};

registerProvider(globalping);
```

**Step 4: Run test to verify it passes**

Run: `bun test src/services/diagnostics/providers/globalping.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add src/services/diagnostics/providers/globalping.ts src/services/diagnostics/providers/globalping.test.ts
git commit -m "feat: add Globalping diagnostic provider"
```

---

### Task 9: Diagnostics MCP tools

**Files:**
- Create: `src/mcp/tools/diagnostics.ts`
- Modify: `src/mcp/index.ts` (add import + registration)
- Test: `src/mcp/index.test.ts` (add diagnostics test block)

**Step 1: Write the failing test**

Append to `src/mcp/index.test.ts`:

```typescript
// --- Diagnostics ---

describe("diagnostics tools", () => {
  beforeEach(setup);
  afterEach(async () => cleanup());

  test("check_node_ip returns skipped when no API key", async () => {
    const node = addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    const result = await client.callTool({
      name: "check_node_ip",
      arguments: { node_id: node.id },
    });
    const data = parseResult(result) as { provider: string; skipped: boolean };
    expect(data.provider).toBe("ipinfo");
    expect(data.skipped).toBe(true);
  });

  test("check_node_ip returns error for invalid node_id", async () => {
    const result = await client.callTool({
      name: "check_node_ip",
      arguments: { node_id: "nonexistent" },
    });
    expect(result.isError).toBe(true);
  });

  test("check_ip_quality returns results from all providers", async () => {
    const node = addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    const result = await client.callTool({
      name: "check_ip_quality",
      arguments: { node_id: node.id },
    });
    const data = parseResult(result) as { results: Array<{ provider: string; skipped: boolean }> };
    // All should be skipped (no API keys configured)
    expect(data.results.length).toBeGreaterThanOrEqual(1);
    expect(data.results.every(r => r.skipped)).toBe(true);
  });

  test("test_node_connectivity tests TCP handshake", async () => {
    const node = addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    const result = await client.callTool({
      name: "test_node_connectivity",
      arguments: { node_id: node.id },
    });
    const data = parseResult(result) as { provider: string; data: { reachable: boolean } };
    expect(data.provider).toBe("connectivity");
    // 1.1.1.1:443 should be reachable (Cloudflare DNS)
    // But in test environment it may not be, so just check structure
    expect(typeof data.data.reachable).toBe("boolean");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/mcp/index.test.ts --filter "diagnostics"`
Expected: FAIL — tool `check_node_ip` not found

**Step 3: Write the diagnostics MCP tools**

Create `src/mcp/tools/diagnostics.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "../../db/index";
import { getNode } from "../../services/node";
import { runProvider, runProvidersByCategory } from "../../services/diagnostics/index";

// Import all providers to trigger self-registration
import "../../services/diagnostics/providers/connectivity";
import "../../services/diagnostics/providers/ipinfo";
import "../../services/diagnostics/providers/scamalytics";
import "../../services/diagnostics/providers/ipqs";
import "../../services/diagnostics/providers/abuseipdb";
import "../../services/diagnostics/providers/globalping";

function resolveNode(db: Db, nodeId: string) {
  const node = getNode(db, nodeId);
  if (!node) return null;
  return node;
}

// 注册诊断工具（4 个）：check_node_ip, check_ip_quality, test_node_connectivity, test_node_route
export function register(server: McpServer, db: Db, _baseUrl: string) {
  server.registerTool(
    "check_node_ip",
    {
      description: "Query node IP information: geolocation, ASN, ISP, privacy detection (requires ipinfo_token setting)",
      inputSchema: {
        node_id: z.string().describe("Node ID to check"),
      },
    },
    async ({ node_id }) => {
      const node = resolveNode(db, node_id);
      if (!node) {
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "Node not found" }) }] };
      }
      const result = await runProvider(db, "ipinfo", { ip: node.host, port: node.port });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.registerTool(
    "check_ip_quality",
    {
      description: "Check IP quality/purity using Scamalytics, IPQS, and AbuseIPDB (runs all configured providers in parallel)",
      inputSchema: {
        node_id: z.string().describe("Node ID to check"),
      },
    },
    async ({ node_id }) => {
      const node = resolveNode(db, node_id);
      if (!node) {
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "Node not found" }) }] };
      }
      const results = await runProvidersByCategory(db, "ip_quality", { ip: node.host });
      return { content: [{ type: "text", text: JSON.stringify({ node_id, ip: node.host, results }) }] };
    }
  );

  server.registerTool(
    "test_node_connectivity",
    {
      description: "Test node connectivity with TCP handshake and measure latency",
      inputSchema: {
        node_id: z.string().describe("Node ID to test"),
      },
    },
    async ({ node_id }) => {
      const node = resolveNode(db, node_id);
      if (!node) {
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "Node not found" }) }] };
      }
      const result = await runProvider(db, "connectivity", { ip: node.host, port: node.port });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.registerTool(
    "test_node_route",
    {
      description: "Test network route from a specified location to the node using Globalping (requires globalping_token setting)",
      inputSchema: {
        node_id: z.string().describe("Node ID to test"),
        from: z.string().optional().describe('Source location, e.g. "Beijing, CN" or "Tokyo, JP". Default: "Beijing, CN"'),
      },
    },
    async ({ node_id, from }) => {
      const node = resolveNode(db, node_id);
      if (!node) {
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "Node not found" }) }] };
      }
      const result = await runProvider(db, "globalping", {
        ip: node.host,
        target: from || "Beijing, CN",
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );
}
```

**Step 4: Register in MCP index**

In `src/mcp/index.ts`, add import:

```typescript
import { register as registerDiagnostics } from "./tools/diagnostics";
```

Add registration call after `registerSettings`:

```typescript
  registerDiagnostics(server, db, baseUrl);
```

**Step 5: Run test to verify it passes**

Run: `bun test src/mcp/index.test.ts --filter "diagnostics"`
Expected: PASS (4 tests)

**Step 6: Run all tests**

Run: `bun test`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/mcp/tools/diagnostics.ts src/mcp/index.ts src/mcp/index.test.ts
git commit -m "feat: add diagnostics MCP tools (check_node_ip, check_ip_quality, test_node_connectivity, test_node_route)"
```

---

### Task 10: testing-nodes skill

**Files:**
- Create: `skills/testing-nodes/SKILL.md`
- Create: `plugin/skills/testing-nodes/SKILL.md` (copy)

**Step 1: Write the skill**

Create `skills/testing-nodes/SKILL.md`:

```markdown
---
name: testing-nodes
description: Use when testing proxy node quality, running diagnostics, or generating a comprehensive node health report.
version: 1.0.0
metadata:
  openclaw:
    emoji: "🔬"
    homepage: https://github.com/Buywatermelon/tunpilot
---

# TunPilot Node Diagnostics

Run comprehensive diagnostics on proxy nodes: IP info, IP quality/purity, connectivity, and route testing. Generates a structured report with actionable recommendations.

**Prerequisite**: TunPilot MCP must be connected. API keys should be configured via `set_setting` tool (use `list_settings` to check which are configured).

---

## Phase 1: Identify Target

Ask the user which node(s) to test. Use `list_nodes` to show available nodes if needed.

Accept:
- A single node name or ID
- "all" to test all enabled nodes

---

## Phase 2: Run Diagnostics (Parallel)

For each target node, call these MCP tools **in parallel**:

1. `check_node_ip` — IP geolocation, ASN, ISP
2. `check_ip_quality` — Scamalytics + IPQS + AbuseIPDB fraud/purity scores
3. `test_node_connectivity` — TCP handshake latency
4. `test_node_route` with `from: "Beijing, CN"` — China route quality
5. `test_node_route` with `from: "Tokyo, JP"` — Japan route quality (optional second location)

---

## Phase 3: Generate Report

Present results as a structured report per node:

### Node: {name} ({host})

#### IP Information
| Item | Value |
|------|-------|
| Location | {city}, {country} |
| ASN | {asn} |
| ISP | {isp} |
| Hosting/DC | {yes/no} |

#### IP Quality
| Check | Result | Rating |
|-------|--------|--------|
| Scamalytics score | {score}/100 | {emoji} {risk_level} |
| IPQS fraud score | {score}/100 | {emoji} |
| AbuseIPDB reports | {count} reports | {emoji} |
| VPN/Proxy detected | {yes/no} | {emoji} |

Rating scale: score 0-30 = low risk, 31-60 = medium risk, 61-100 = high risk.

#### Connectivity
| Check | Result |
|-------|--------|
| TCP handshake | {latency}ms |
| Port reachable | {yes/no} |

#### Route Quality
| From | Latency | Packet Loss |
|------|---------|-------------|
| Beijing, CN | {avg}ms | {loss}% |
| Tokyo, JP | {avg}ms | {loss}% |

Items marked "未配置" indicate the corresponding API key is not set. Use `set_setting` to configure.

---

## Phase 4: Recommendations

Based on the results, provide actionable recommendations:

- **High fraud score (>60)**: "IP may be flagged by services. Consider rotating IP or switching provider."
- **VPN/Proxy detected**: "IP is known as a proxy endpoint. Streaming services may block it."
- **High abuse reports (>10)**: "IP has abuse history. Monitor for potential blacklisting."
- **High latency from China (>300ms)**: "Route quality is poor. Consider a node with CN2/GIA routing."
- **Packet loss >2%**: "Network path is unstable. Check provider's network quality."
- **TCP unreachable**: "Port is not responding. Check firewall rules and service status."

---

## Quick Reference: API Key Setup

| Setting Key | Service | Get Key At |
|-------------|---------|------------|
| ipinfo_token | IPinfo.io | https://ipinfo.io/signup |
| scamalytics_key | Scamalytics | https://scamalytics.com/ip/api |
| ipqs_key | IPQualityScore | https://www.ipqualityscore.com/create-account |
| globalping_token | Globalping | https://globalping.io/auth |
| abuseipdb_key | AbuseIPDB | https://www.abuseipdb.com/register |

Example: `set_setting(key: "ipinfo_token", value: "your_token_here")`

---

## MCP Tools Reference

| Tool | Purpose |
|------|---------|
| `list_settings` | Check which API keys are configured |
| `set_setting` | Configure an API key |
| `check_node_ip` | IP geolocation + ASN (uses ipinfo) |
| `check_ip_quality` | IP purity scores (uses scamalytics + ipqs + abuseipdb) |
| `test_node_connectivity` | TCP handshake latency test |
| `test_node_route` | Route quality from specified location (uses globalping) |
```

**Step 2: Copy skill to plugin directory**

```bash
mkdir -p plugin/skills/testing-nodes
cp skills/testing-nodes/SKILL.md plugin/skills/testing-nodes/SKILL.md
```

**Step 3: Commit**

```bash
git add skills/testing-nodes/SKILL.md plugin/skills/testing-nodes/SKILL.md
git commit -m "feat: add testing-nodes skill for comprehensive node diagnostics"
```

---

### Task 11: Update CLAUDE.md and plugin metadata

**Files:**
- Modify: `CLAUDE.md` (update project structure + tool count)
- Modify: `plugin/.claude-plugin/plugin.json` (update description)

**Step 1: Update CLAUDE.md**

Add to the project structure section:

- `src/services/diagnostics/` directory with `index.ts` and `providers/` subdirectory
- `src/mcp/tools/diagnostics.ts` and `src/mcp/tools/settings.ts`
- `skills/testing-nodes/` directory
- Update MCP tool count from 17 to 24 (added 3 settings + 4 diagnostics)

Update the comment in `src/mcp/index.ts` from "共 17 个工具" to "共 24 个工具".

**Step 2: Run all tests**

Run: `bun test`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add CLAUDE.md plugin/.claude-plugin/plugin.json src/mcp/index.ts
git commit -m "docs: update project docs for node diagnostics feature"
```

---

### Task 12: Final integration test

**Step 1: Run the full test suite**

Run: `bun test`
Expected: All tests PASS with no regressions

**Step 2: Verify dev server starts**

Run: `bun run dev` (verify it starts without errors, then Ctrl+C)

**Step 3: Verify MCP tool listing**

Check that all 24 tools are registered by reviewing the MCP server creation output.

**Step 4: Final commit if any fixes needed**

Only commit if integration testing revealed issues that needed fixing.
