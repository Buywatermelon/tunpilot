# TunPilot

Agent-native Hysteria2 proxy node management service. No web UI — designed for LLM Agents via MCP.

## Tech Stack

- **Runtime**: Bun (not Node.js)
- **HTTP**: Hono
- **Database**: SQLite via Drizzle ORM (`bun:sqlite`)
- **MCP**: `@modelcontextprotocol/sdk` + `@hono/mcp` (Streamable HTTP)

## Project Structure

```
src/
├── index.ts              # Entry point: server startup, MCP session management, traffic sync
├── config.ts             # Environment config (TUNPILOT_PORT, TUNPILOT_BASE_URL, etc.)
├── db/
│   ├── schema.ts         # Drizzle schema: nodes, users, userNodes, subscriptions, trafficLogs, settings
│   └── index.ts          # DB init (WAL mode, foreign keys)
├── http/index.ts         # HTTP routes: /auth/:nodeId/:authSecret, /sub/:token, /health
├── mcp/
│   ├── index.ts          # MCP server factory
│   └── tools/            # 21 MCP tools in 6 groups
│       ├── nodes.ts      # Node CRUD (4 tools)
│       ├── users.ts      # User CRUD (7 tools)
│       ├── subscriptions.ts  # Subscription management (4 tools)
│       ├── monitoring.ts # Health check & traffic stats (2 tools)
│       ├── settings.ts   # Settings management (3 tools)
│       └── diagnostics.ts # Node diagnostics (1 tool: test_node_ipquality)
└── services/             # Business logic layer
    ├── auth.ts           # 4-step Hysteria2 auth callback
    ├── node.ts           # Node CRUD
    ├── user.ts           # User CRUD + node assignment
    ├── subscription.ts   # Subscription lifecycle
    ├── settings.ts       # Settings CRUD (API key storage)
    ├── traffic.ts        # Traffic sync from nodes + stats query
    ├── ipquality.ts      # IPQuality SSH runner (xykt/IPQuality script)
    └── formats/          # Subscription format renderers (Format Registry pattern)
        ├── index.ts      # Registry: registerFormat() / getFormat()
        ├── shadowrocket.ts
        ├── singbox.ts
        ├── clash.ts
        └── surge.ts
plugin/                   # Claude Code plugin (skills + MCP connection)
openclaw/                 # OpenClaw plugin (skills + gateway auto-registration)
skills/                   # Shared skill definitions (synced to plugin dirs)
scripts/deploy.sh         # One-click deployment to systemd
```

## Commands

```sh
bun run dev          # Hot reload development
bun run start        # Production
bun test             # Run all tests
bun run db:push      # Sync Drizzle schema to SQLite
bun run db:studio    # Drizzle Studio (DB browser)
```

## Environment Variables

Bun auto-loads `.env` — no dotenv needed.

| Variable | Default | Description |
|----------|---------|-------------|
| `TUNPILOT_PORT` | 3000 | Listen port |
| `TUNPILOT_HOST` | 0.0.0.0 | Listen address |
| `TUNPILOT_DB_PATH` | ./data/tunpilot.db | SQLite database path |
| `TUNPILOT_BASE_URL` | http://localhost:3000 | External URL for subscription links |
| `MCP_AUTH_TOKEN` | (empty) | Bearer token for /mcp endpoint |
| `TRAFFIC_SYNC_INTERVAL` | 300000 | Traffic sync interval (ms) |

## Key Patterns

- **Auth flow**: Hysteria2 node → POST `/auth/:nodeId/:authSecret` → validate node → lookup user by password → check status/quota/expiry → check node permission
- **Subscription formats**: implement `SubscriptionFormat` interface, call `registerFormat()` — auto-discovered on import
- **Diagnostics**: single `test_node_ipquality` tool runs [xykt/IPQuality](https://github.com/xykt/IPQuality) script on node via SSH — queries 10 IP risk databases with zero API keys
- **MCP sessions**: per-client `McpServer` instances with 30-min TTL auto-cleanup
- **Traffic sync**: periodic fetch from nodes' stats API → atomic transaction (insert logs + update used_bytes)
- **Cascading deletes**: all FK relationships use ON DELETE CASCADE

## Conventions

- Use Bun APIs: `bun:sqlite`, `Bun.serve()`, `Bun.file()`, `bun test`
- Don't use: express, better-sqlite3, dotenv, node:fs readFile/writeFile
- Tests use `bun:test` with in-memory SQLite (`initDatabase(":memory:")`)
- All database tables use UUID primary keys (except `trafficLogs` which uses auto-increment)
