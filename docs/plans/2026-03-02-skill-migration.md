# Skill Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate pure-prompt MCP tools (`get_deploy_template`, `get_setup_guide`) to a Claude Code Skill, merge `get_cert_status` into monitoring, and delete `ops.ts`.

**Architecture:** Create a `.claude/skills/deploying-nodes/` skill with SKILL.md as entry point and two sub-files for the guide and template. Move `get_cert_status` to `monitoring.ts` where it semantically belongs. Remove `ops.ts` and its registration.

**Tech Stack:** Claude Code Skills (markdown), MCP SDK, Bun test

---

### Task 1: Create the `deploying-nodes` skill

**Files:**
- Create: `.claude/skills/deploying-nodes/SKILL.md`
- Create: `.claude/skills/deploying-nodes/setup-guide.md`
- Create: `.claude/skills/deploying-nodes/hysteria2-template.md`

**Step 1: Create skill directory**

Run: `mkdir -p .claude/skills/deploying-nodes`

**Step 2: Create SKILL.md**

Create `.claude/skills/deploying-nodes/SKILL.md`:

```markdown
---
name: deploying-nodes
description: Use when deploying a new TunPilot proxy node, configuring Hysteria2, setting up TLS certificates, or performing node operations. Triggers on keywords like deploy, node setup, hysteria2, VPS, certificate.
---

# TunPilot Node Deployment & Operations

TunPilot manages Hysteria2 proxy nodes. This skill provides deployment guides and configuration templates.

## Available References

When deploying a new node, read `setup-guide.md` for the step-by-step process.

When you need the Hysteria2 server configuration, read `hysteria2-template.md` for the config template with placeholders.

## Key MCP Tools

After deploying, use these MCP tools to register and verify:
- `add_node` — Register the node in TunPilot (returns auth_callback_url)
- `check_health` — Verify node connectivity
- `get_cert_status` — Check TLS certificate expiry
```

**Step 3: Create setup-guide.md**

Create `.claude/skills/deploying-nodes/setup-guide.md`:

```markdown
# New Node Setup Guide

1. Deploy Hysteria2 on the target VPS:
   - Install: curl -fsSL https://get.hy2.sh/ | bash
   - Create config directory: mkdir -p /etc/hysteria

2. Obtain TLS certificate:
   - Use ACME: hysteria cert --domain your-domain.com
   - Or manual: place cert.pem and key.pem in /etc/hysteria/

3. Get config template:
   - Read `hysteria2-template.md` in this skill directory
   - Fill in AUTH_CALLBACK_URL, STATS_PORT, STATS_SECRET

4. Register the node in TunPilot:
   - Call `add_node` MCP tool with the node details
   - Note the returned auth_callback_url

5. Update Hysteria2 config:
   - Set auth.http.url to the auth_callback_url from step 4
   - Restart: systemctl restart hysteria-server

6. Verify connectivity:
   - Call `check_health` MCP tool to confirm the node is reachable
```

**Step 4: Create hysteria2-template.md**

Create `.claude/skills/deploying-nodes/hysteria2-template.md`:

````markdown
# Hysteria2 Configuration Template

Replace the `{{PLACEHOLDER}}` values before deploying.

```yaml
listen: :443

tls:
  cert: /etc/hysteria/cert.pem
  key: /etc/hysteria/key.pem

auth:
  type: http
  http:
    url: {{AUTH_CALLBACK_URL}}

masquerade:
  type: proxy
  proxy:
    url: https://news.ycombinator.com
    rewriteHost: true

trafficStats:
  listen: :{{STATS_PORT}}
  secret: {{STATS_SECRET}}
```

## Placeholders

| Placeholder | Description | Example |
|---|---|---|
| `{{AUTH_CALLBACK_URL}}` | TunPilot auth callback URL (returned by `add_node`) | `https://tunpilot.example.com/auth/callback/node-id?secret=xxx` |
| `{{STATS_PORT}}` | Port for traffic stats API | `9999` |
| `{{STATS_SECRET}}` | Secret for traffic stats API | A random string |
````

**Step 5: Commit**

```bash
git add .claude/skills/deploying-nodes/
git commit -m "feat: add deploying-nodes skill for node deployment guides"
```

---

### Task 2: Move `get_cert_status` to `monitoring.ts`

**Files:**
- Modify: `src/mcp/tools/monitoring.ts`
- Reference: `src/mcp/tools/ops.ts` (source of `get_cert_status`)

**Step 1: Add `get_cert_status` to monitoring.ts**

Add the following tool registration at the end of the `register` function in `src/mcp/tools/monitoring.ts`, before the closing `}`:

```typescript
  server.tool(
    "get_cert_status",
    "Get certificate expiry status for all nodes",
    {},
    async () => {
      const certs = listNodes(db).map((node) => ({
        id: node.id,
        name: node.name,
        host: node.host,
        cert_path: node.cert_path,
        cert_expires: node.cert_expires,
        enabled: node.enabled,
      }));
      return { content: [{ type: "text", text: JSON.stringify(certs) }] };
    }
  );
```

Note: `monitoring.ts` already imports `listNodes` from `../../services/node`, so no new import needed.

**Step 2: Run tests to verify `get_cert_status` still works**

Run: `bun test src/mcp/index.test.ts -t "get_cert_status"`
Expected: PASS (test still calls the same tool name, server registers it from monitoring now)

**Step 3: Commit**

```bash
git add src/mcp/tools/monitoring.ts
git commit -m "refactor: move get_cert_status to monitoring tools"
```

---

### Task 3: Remove `ops.ts` and its registration

**Files:**
- Delete: `src/mcp/tools/ops.ts`
- Modify: `src/mcp/index.ts`

**Step 1: Remove ops import and registration from `src/mcp/index.ts`**

Remove line 7:
```typescript
import { register as registerOps } from "./tools/ops";
```

Remove line 19:
```typescript
  registerOps(server, db, baseUrl);
```

Result should be:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "../db/index";
import { register as registerNodes } from "./tools/nodes";
import { register as registerUsers } from "./tools/users";
import { register as registerSubscriptions } from "./tools/subscriptions";
import { register as registerMonitoring } from "./tools/monitoring";

export function createMcpServer(db: Db, baseUrl: string): McpServer {
  const server = new McpServer({
    name: "tunpilot",
    version: "0.1.0",
  });

  registerNodes(server, db, baseUrl);
  registerUsers(server, db, baseUrl);
  registerSubscriptions(server, db, baseUrl);
  registerMonitoring(server, db, baseUrl);

  return server;
}
```

**Step 2: Delete `src/mcp/tools/ops.ts`**

Run: `rm src/mcp/tools/ops.ts`

**Step 3: Commit**

```bash
git add src/mcp/index.ts
git rm src/mcp/tools/ops.ts
git commit -m "refactor: remove ops tool module, content migrated to skill + monitoring"
```

---

### Task 4: Update tests

**Files:**
- Modify: `src/mcp/index.test.ts`

**Step 1: Move `get_cert_status` test into the monitoring describe block**

In `src/mcp/index.test.ts`, add the following test inside the `describe("monitoring tools", ...)` block, after the `get_traffic_stats` test (after line 262):

```typescript
  test("get_cert_status returns cert info for nodes", async () => {
    addNode(db, {
      name: "n1",
      host: "1.1.1.1",
      port: 443,
      protocol: "hysteria2",
      cert_expires: "2027-01-01T00:00:00Z",
      cert_path: "/etc/ssl/cert.pem",
    });

    const result = await client.callTool({ name: "get_cert_status", arguments: {} });
    const data = parseResult(result) as Array<{ name: string; cert_expires: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.cert_expires).toBe("2027-01-01T00:00:00Z");
  });
```

**Step 2: Remove the entire `ops tools` describe block**

Delete lines 265-305 (the `// --- Ops ---` comment and the entire `describe("ops tools", ...)` block).

**Step 3: Run all tests**

Run: `bun test src/mcp/index.test.ts`
Expected: All tests PASS. The `get_cert_status` test now runs under monitoring. The `get_deploy_template` and `get_setup_guide` tests are removed.

**Step 4: Commit**

```bash
git add src/mcp/index.test.ts
git commit -m "test: move cert_status test to monitoring, remove migrated ops tests"
```

---

### Task 5: Final verification

**Step 1: Run full test suite**

Run: `bun test`
Expected: All tests PASS.

**Step 2: TypeScript type check**

Run: `bunx tsc --noEmit`
Expected: No errors.

**Step 3: Verify skill files exist**

Run: `ls -la .claude/skills/deploying-nodes/`
Expected: SKILL.md, setup-guide.md, hysteria2-template.md

**Step 4: Verify ops.ts is gone**

Run: `ls src/mcp/tools/`
Expected: nodes.ts, users.ts, subscriptions.ts, monitoring.ts (no ops.ts)
