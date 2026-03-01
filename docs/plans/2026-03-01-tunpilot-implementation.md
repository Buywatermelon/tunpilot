# TunPilot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build TunPilot — an agent-native proxy node management service with MCP interface, Hysteria2 auth callback, traffic sync, and multi-format subscription generation.

**Architecture:** Hono HTTP server on Bun.js, SQLite data layer, MCP Streamable HTTP via `@modelcontextprotocol/sdk` + `@modelcontextprotocol/hono`. Service layer shared between MCP tools and HTTP endpoints. 4-tier: Data → Service → MCP/HTTP → Skill (client-side, future).

**Tech Stack:** Bun.js, TypeScript, Hono, SQLite (bun:sqlite), @modelcontextprotocol/sdk, @modelcontextprotocol/hono

**Design docs:** `docs/plans/2026-03-01-tunpilot-design.md` and `docs/plans/2026-03-01-tunpilot-protocols.md`

---

## Phase 1: Foundation (sequential)

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts` (placeholder)

**Step 1: Init bun project and install dependencies**

```bash
bun init -y
bun add hono @modelcontextprotocol/sdk @modelcontextprotocol/hono
```

**Step 2: Configure tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Step 3: Create placeholder entry point**

`src/index.ts`:
```ts
console.log("TunPilot starting...");
```

**Step 4: Verify project runs**

Run: `bun run src/index.ts`
Expected: prints "TunPilot starting..."

**Step 5: Update .gitignore and commit**

Add `data/` to `.gitignore`.

```bash
git add -A && git commit -m "feat: project scaffolding with deps"
```

---

### Task 2: Config Module

**Files:**
- Create: `src/config.ts`
- Create: `src/config.test.ts`

**Step 1: Write test for config**

`src/config.test.ts`:
```ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";

describe("config", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("uses defaults when env vars not set", async () => {
    delete process.env.TUNPILOT_PORT;
    delete process.env.TUNPILOT_DB_PATH;
    // Re-import to pick up new env
    const { getConfig } = await import("./config");
    const config = getConfig();
    expect(config.port).toBe(3000);
    expect(config.dbPath).toBe("./data/tunpilot.db");
    expect(config.trafficSyncInterval).toBe(300000);
  });

  test("reads from env vars", async () => {
    process.env.TUNPILOT_PORT = "4000";
    process.env.MCP_AUTH_TOKEN = "test-token";
    process.env.TUNPILOT_BASE_URL = "https://example.com";
    const { getConfig } = await import("./config");
    const config = getConfig();
    expect(config.port).toBe(4000);
    expect(config.mcpAuthToken).toBe("test-token");
    expect(config.baseUrl).toBe("https://example.com");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/config.test.ts`
Expected: FAIL

**Step 3: Implement config**

`src/config.ts`:
```ts
export interface Config {
  port: number;
  host: string;
  dbPath: string;
  baseUrl: string;
  mcpAuthToken: string;
  trafficSyncInterval: number;
}

export function getConfig(): Config {
  return {
    port: Number(process.env.TUNPILOT_PORT) || 3000,
    host: process.env.TUNPILOT_HOST || "0.0.0.0",
    dbPath: process.env.TUNPILOT_DB_PATH || "./data/tunpilot.db",
    baseUrl: process.env.TUNPILOT_BASE_URL || "http://localhost:3000",
    mcpAuthToken: process.env.MCP_AUTH_TOKEN || "",
    trafficSyncInterval: Number(process.env.TRAFFIC_SYNC_INTERVAL) || 300000,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts && git commit -m "feat: config module with env var support"
```

---

### Task 3: Database Layer

**Files:**
- Create: `src/db/index.ts`
- Create: `src/db/index.test.ts`

**Step 1: Write test for database initialization**

`src/db/index.test.ts`:
```ts
import { describe, test, expect, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase } from "./index";

describe("database", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("creates all tables", () => {
    db = initDatabase(":memory:");
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("nodes");
    expect(names).toContain("users");
    expect(names).toContain("user_nodes");
    expect(names).toContain("subscriptions");
    expect(names).toContain("traffic_logs");
  });

  test("is idempotent (safe to call twice)", () => {
    db = initDatabase(":memory:");
    expect(() => initDatabase(":memory:")).not.toThrow();
  });

  test("nodes table has auth_secret column", () => {
    db = initDatabase(":memory:");
    const info = db.query("PRAGMA table_info(nodes)").all() as { name: string }[];
    const cols = info.map((c) => c.name);
    expect(cols).toContain("auth_secret");
    expect(cols).toContain("sni");
    expect(cols).toContain("ssh_port");
  });

  test("cascade deletes work for user_nodes", () => {
    db = initDatabase(":memory:");
    db.run("INSERT INTO users (id, name, password) VALUES ('u1', 'alice', 'pass')");
    db.run("INSERT INTO nodes (id, name, host, port, protocol, auth_secret) VALUES ('n1', 'US', 'host', 443, 'hysteria2', 'secret')");
    db.run("INSERT INTO user_nodes (user_id, node_id) VALUES ('u1', 'n1')");
    db.run("DELETE FROM users WHERE id = 'u1'");
    const rows = db.query("SELECT * FROM user_nodes").all();
    expect(rows).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/db/index.test.ts`
Expected: FAIL

**Step 3: Implement database init**

`src/db/index.ts` — create the function that initializes all tables per the schema in the design doc. Use `CREATE TABLE IF NOT EXISTS` for all 5 tables. Enable WAL mode and foreign keys with `PRAGMA`.

See `docs/plans/2026-03-01-tunpilot-design.md` § 数据模型 for the exact SQL schema.

**Step 4: Run test to verify it passes**

Run: `bun test src/db/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/db/ && git commit -m "feat: database layer with schema init"
```

---

## Phase 2: Service Layer (parallelizable — agents can work on Tasks 4, 5 in parallel)

### Task 4: Node Service

**Files:**
- Create: `src/services/node.ts`
- Create: `src/services/node.test.ts`

**Implements:** `addNode`, `listNodes`, `getNode`, `updateNode`, `removeNode`

Key behaviors to test:
- `addNode` auto-generates `auth_secret` (32-char hex)
- `addNode` returns the generated `auth_secret` and full auth callback URL
- `listNodes` returns all nodes with `enabled` status
- `updateNode` allows partial updates
- `removeNode` cascades to `user_nodes`
- All functions take a `Database` instance as first param

Each function is a plain function that takes `(db: Database, params)` and returns typed results. No classes needed.

Reference: design doc § MCP Tools 清单 > 节点管理

**Step 1:** Write failing tests for all 5 operations
**Step 2:** Run: `bun test src/services/node.test.ts` → FAIL
**Step 3:** Implement all operations
**Step 4:** Run: `bun test src/services/node.test.ts` → PASS
**Step 5:** Commit: `git commit -m "feat: node service CRUD"`

---

### Task 5: User Service

**Files:**
- Create: `src/services/user.ts`
- Create: `src/services/user.test.ts`

**Implements:** `createUser`, `listUsers`, `getUser`, `updateUser`, `deleteUser`, `resetTraffic`

Key behaviors to test:
- `createUser` generates UUID for id, requires name + password
- `listUsers` includes `used_bytes` and `enabled` status
- `updateUser` allows partial updates (quota, expiry, enabled, password, max_devices)
- `deleteUser` cascades to `user_nodes` and `subscriptions`
- `resetTraffic` sets `used_bytes = 0` for a specific user

Same pattern as Task 4: plain functions with `(db, params)` signature.

Reference: design doc § MCP Tools 清单 > 用户管理

**Step 1:** Write failing tests
**Step 2:** Run: `bun test src/services/user.test.ts` → FAIL
**Step 3:** Implement
**Step 4:** Run: `bun test src/services/user.test.ts` → PASS
**Step 5:** Commit: `git commit -m "feat: user service CRUD"`

---

## Phase 3: Dependent Services (parallelizable — Tasks 6, 7, 8 can run in parallel after Phase 2)

### Task 6: Auth Service

**Files:**
- Create: `src/services/auth.ts`
- Create: `src/services/auth.test.ts`

**Implements:** `authenticateUser(db, nodeId, authSecret, authPayload): AuthResult`

The core auth callback logic from design doc § Auth 回调处理逻辑:

1. Verify node: exists + auth_secret matches + enabled
2. Find user by password (auth field)
3. Check user: enabled, not expired, within quota
4. Check user_nodes permission
5. Return `{ok: true, id: user.name}` or `{ok: false, id: ""}`

Test cases:
- Valid auth → ok
- Invalid node secret → not ok
- Disabled node → not ok
- Wrong password → not ok
- Disabled user → not ok
- Expired user → not ok
- Over quota user → not ok
- User not assigned to node → not ok
- quota_bytes = 0 means unlimited → ok

**Step 1-5:** TDD cycle, commit: `git commit -m "feat: auth service with full validation"`

---

### Task 7: Subscription Service

**Files:**
- Create: `src/services/subscription.ts`
- Create: `src/services/subscription.test.ts`
- Create: `config/routing-rules.json` (minimal default rules)

**Implements:**
- `generateSubscription(db, userId, format): {id, token, url}`
- `listSubscriptions(db, userId): Subscription[]`
- `getSubscriptionConfig(db, token): string` — render full config
- `renderShadowrocket(user, nodes): string` — base64-encoded URI list
- `renderSingbox(user, nodes): object` — full JSON config
- `renderClash(user, nodes): string` — full YAML config

For YAML rendering, use a simple template approach (string concatenation) — no YAML library needed since the structure is fixed.

Reference: `docs/plans/2026-03-01-tunpilot-protocols.md` § 订阅生成格式 for exact templates.

Test cases:
- `generateSubscription` creates record with UUID token
- `renderShadowrocket` produces valid base64-encoded URIs
- `renderSingbox` produces valid JSON with correct outbounds
- `renderClash` produces valid YAML with proxies array
- `getSubscriptionConfig` routes to correct renderer based on format
- Nodes with `sni` field use it; without, fall back to `host`

**Step 1-5:** TDD cycle, commit: `git commit -m "feat: subscription service with 3 formats"`

---

### Task 8: Traffic Sync Service

**Files:**
- Create: `src/services/traffic.ts`
- Create: `src/services/traffic.test.ts`

**Implements:**
- `syncTrafficFromNode(db, node): Promise<void>` — fetch `/traffic?clear=1`, write logs, update `used_bytes`
- `syncAllNodes(db): Promise<SyncResult[]>` — iterate all enabled nodes
- `getTrafficStats(db, filters): TrafficStat[]` — query `traffic_logs` by user/node/time range
- `startTrafficSync(db, intervalMs): Timer` — `setInterval` wrapper

For testing, mock the `fetch` calls to nodes. Use `bun:test` mock capabilities.

Test cases:
- `syncTrafficFromNode` writes to `traffic_logs` and increments `used_bytes`
- Handles node unreachable gracefully (logs error, continues)
- `getTrafficStats` filters by user_id, node_id, date range
- `startTrafficSync` calls sync at interval (test with short interval)

**Step 1-5:** TDD cycle, commit: `git commit -m "feat: traffic sync service"`

---

## Phase 4: HTTP Endpoints + MCP (parallelizable — Tasks 9, 10 can run in parallel)

### Task 9: HTTP Server + Endpoints

**Files:**
- Create: `src/http/index.ts`
- Create: `src/http/auth.ts`
- Create: `src/http/subscription.ts`
- Create: `src/http/health.ts`
- Create: `src/http/index.test.ts`

**Implements Hono routes:**
- `POST /auth/:nodeId/:authSecret` — calls auth service, returns JSON
- `GET /sub/:token` — calls subscription service, returns rendered config
- `GET /health` — returns `{status: "ok", timestamp}`

Use `app.fetch()` for testing (Hono's built-in test support — no need to start a real server).

Test cases for auth endpoint:
- Valid auth → 200 `{ok: true, id: "username"}`
- Invalid → 200 `{ok: false}` (always HTTP 200 per Hysteria2 spec)
- Missing body → 200 `{ok: false}`

Test cases for subscription endpoint:
- Valid token → 200 with correct Content-Type per format
- Invalid token → 404

Test cases for health:
- Returns 200 with status "ok"

**Step 1-5:** TDD cycle, commit: `git commit -m "feat: HTTP endpoints for auth, subscription, health"`

---

### Task 10: MCP Server + All Tools

**Files:**
- Create: `src/mcp/index.ts`
- Create: `src/mcp/tools/users.ts`
- Create: `src/mcp/tools/nodes.ts`
- Create: `src/mcp/tools/subscriptions.ts`
- Create: `src/mcp/tools/monitoring.ts`
- Create: `src/mcp/tools/ops.ts`
- Create: `src/mcp/index.test.ts`

**Implements all 20 MCP tools** using `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`.

Each tool file exports a function `register(server: McpServer, db: Database)` that calls `server.tool(...)` for each tool in its group.

Tool groups:
- **users.ts**: `list_users`, `create_user`, `update_user`, `delete_user`, `reset_traffic`
- **nodes.ts**: `list_nodes`, `get_node_info`, `add_node`, `update_node`, `remove_node`
- **subscriptions.ts**: `generate_subscription`, `list_subscriptions`, `get_subscription_config`
- **monitoring.ts**: `check_health`, `get_traffic_stats`
- **ops.ts**: `get_deploy_template`, `get_cert_status`, `get_setup_guide`

Each tool:
1. Defines input schema using zod (MCP SDK convention)
2. Calls the corresponding service function
3. Returns MCP-formatted result `{content: [{type: "text", text: JSON.stringify(result)}]}`

Testing: Use MCP SDK's `InMemoryTransport` to create a client-server pair and call tools programmatically. Test at least one tool per group to verify wiring.

**Step 1-5:** TDD cycle, commit: `git commit -m "feat: MCP server with all 20 tools"`

---

## Phase 5: Integration (sequential)

### Task 11: Main Entry Point

**Files:**
- Modify: `src/index.ts`

**Wires everything together:**
1. Load config
2. Ensure `data/` directory exists
3. Initialize database
4. Create Hono app with HTTP routes
5. Create MCP server, register all tools
6. Mount MCP on `/mcp` using `@modelcontextprotocol/hono`
7. Add Bearer token auth middleware on `/mcp` routes
8. Start traffic sync timer
9. Start Bun server

```ts
import { Hono } from "hono";
import { getConfig } from "./config";
import { initDatabase } from "./db";
import { createHttpRoutes } from "./http";
import { createMcpServer } from "./mcp";
// ... wire together and start
```

**Step 1:** Implement the main entry point
**Step 2:** Verify: `bun run src/index.ts` starts without errors, `/health` responds
**Step 3:** Commit: `git commit -m "feat: main entry point wiring all layers"`

---

### Task 12: Integration Tests

**Files:**
- Create: `src/integration.test.ts`

End-to-end tests using a real in-memory database and Hono's `app.fetch()`:

1. **Full auth flow**: create user → add node → assign user to node → POST /auth → verify ok
2. **Subscription flow**: create user + node → assign → generate subscription → GET /sub/:token → verify config content
3. **Auth rejection cases**: disabled user, expired, over quota, wrong node
4. **Health endpoint**: GET /health → 200

**Step 1:** Write integration tests
**Step 2:** Run: `bun test src/integration.test.ts` → PASS
**Step 3:** Commit: `git commit -m "test: integration tests for auth and subscription flows"`

---

## Task Dependency Graph

```
Task 1 (scaffolding)
  → Task 2 (config)
    → Task 3 (database)
      → Task 4 (node service)    ─┐
      → Task 5 (user service)    ─┤ parallel
                                   │
      → Task 6 (auth service)    ─┤ parallel (after 4+5)
      → Task 7 (subscription)   ─┤
      → Task 8 (traffic sync)   ─┘
                                   │
      → Task 9 (HTTP endpoints)  ─┤ parallel (after 6+7)
      → Task 10 (MCP server)    ─┘
                                   │
      → Task 11 (main entry)      │ sequential
      → Task 12 (integration)     │
```

## Parallelization Strategy for Agent Team

**Agent A (lead):** Tasks 1-3 (foundation), then Task 11, 12
**Agent B:** Tasks 4 (node service) + 10 (MCP tools — node part)
**Agent C:** Tasks 5 (user service) + 6 (auth service) + 9 (HTTP endpoints)
**Agent D:** Tasks 7 (subscription) + 8 (traffic sync)

Agents B, C, D start after Agent A completes Tasks 1-3.
