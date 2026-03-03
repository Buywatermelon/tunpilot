# Node Diagnostics Design

Date: 2026-03-03

## Overview

Add node testing capabilities to TunPilot: IP information, IP quality/purity scoring, connectivity testing, and route/line testing. Multiple atomic MCP tools orchestrated by a skill for comprehensive reports.

## Decisions

- **Architecture**: Provider Registry pattern (consistent with existing Format Registry)
- **Execution**: API-only (no SSH), extensible to SSH later
- **API services**: IPinfo + Scamalytics + IPQS + Globalping + AbuseIPDB
- **API Key storage**: Database `settings` table, managed via MCP tools
- **Orchestration**: Atomic MCP tools + `testing-nodes` skill for comprehensive reports

## Data Model

### New table: `settings`

| Column | Type | Description |
|--------|------|-------------|
| key | TEXT PRIMARY KEY | e.g. "ipinfo_token", "scamalytics_key" |
| value | TEXT NOT NULL | API key value |
| updated_at | TEXT DEFAULT datetime('now') | Last updated |

Known keys:

| Key | Service | Free Tier |
|-----|---------|-----------|
| ipinfo_token | IPinfo.io | 50K/month |
| scamalytics_key | Scamalytics | 5K/month |
| ipqs_key | IPQualityScore | 5K/month |
| globalping_token | Globalping | 500/hour (authenticated) |
| abuseipdb_key | AbuseIPDB | 1K/day |

## Provider Registry Architecture

### File structure

```
src/services/diagnostics/
├── index.ts                  # DiagnosticProvider interface + registry
└── providers/
    ├── ipinfo.ts             # IP geolocation, ASN, ISP, privacy detection
    ├── scamalytics.ts        # IP purity/fraud risk scoring
    ├── ipqs.ts               # Proxy/VPN/Bot detection + fraud score
    ├── abuseipdb.ts          # IP abuse report lookup
    ├── globalping.ts         # Remote multi-location ping/traceroute/MTR
    └── connectivity.ts       # Built-in TCP handshake latency test
```

### Provider interface

```typescript
interface DiagnosticProvider {
  name: string
  category: "ip_info" | "ip_quality" | "route" | "connectivity"
  settingKey: string | null       // null = no API key needed

  run(params: DiagnosticParams): Promise<DiagnosticResult>
}

interface DiagnosticParams {
  ip: string
  target?: string               // route test target (e.g. "Beijing, CN")
  options?: Record<string, unknown>
}

interface DiagnosticResult {
  provider: string
  category: string
  skipped: boolean
  skipReason?: string
  data: Record<string, unknown>
  duration_ms: number
}
```

### Registry functions

- `registerProvider(provider)` — register a provider
- `getProviders(category?)` — get by category, or all
- `runAll(params)` — parallel execution, auto-skip missing API keys
- Self-registration at bottom of each provider file

### Provider outputs

| Provider | Input | Core Output |
|----------|-------|-------------|
| ipinfo | ip | country, region, city, org, asn, isp, privacy(vpn/proxy/hosting) |
| scamalytics | ip | score(0-100), risk_level, proxy_type |
| ipqs | ip | fraud_score, vpn, proxy, tor, bot, recent_abuse, ISP, connection_type |
| abuseipdb | ip | abuse_confidence(0-100), total_reports, last_reported, usage_type |
| globalping | ip + target | latency_ms, packet_loss%, hops[], asn_path[] |
| connectivity | ip + port | reachable, handshake_ms, tls_valid |

## MCP Tools

### Settings management (`src/mcp/tools/settings.ts`)

| Tool | Params | Description |
|------|--------|-------------|
| set_setting | key, value | Set API key |
| list_settings | — | List configured keys (values masked after 4 chars) |
| delete_setting | key | Delete a setting |

### Node diagnostics (`src/mcp/tools/diagnostics.ts`)

| Tool | Params | Description |
|------|--------|-------------|
| check_node_ip | node_id | Query node IP info (ipinfo provider) |
| check_ip_quality | node_id | Query IP quality (scamalytics + ipqs + abuseipdb, parallel) |
| test_node_connectivity | node_id | TCP handshake + Stats API ping |
| test_node_route | node_id, from? | Ping/traceroute from specified location (globalping). Default from: "Beijing, CN" |

All tools take `node_id` (auto-resolve host/port from DB), consistent with existing tool style.

## Skill: testing-nodes

### Flow

```
Phase 1: Identify target node(s)
Phase 2: Parallel execution
  → check_node_ip(node_id)
  → check_ip_quality(node_id)
  → test_node_connectivity(node_id)
  → test_node_route(node_id, from="Beijing, CN")
  → test_node_route(node_id, from="Tokyo, JP")  // optional
Phase 3: Generate report (structured table + ratings)
Phase 4: Actionable recommendations
```

### Relationship

```
Skill (testing-nodes)          ← "comprehensive test" entry point
  ├── check_node_ip            ← atomic MCP tool
  ├── check_ip_quality         ← atomic MCP tool
  ├── test_node_connectivity   ← atomic MCP tool
  └── test_node_route          ← atomic MCP tool
```

Agent can also call any tool directly, bypassing the skill.

## Error Handling & Degradation

### API key missing

Provider returns `{ skipped: true, reason: "API key not configured (xxx_key)" }`. Other providers unaffected. Skill report shows "未配置" for skipped items.

### API call failure

Each provider catches errors internally. Failure returns `{ skipped: true, reason: "API error: ..." }`. Does not affect other providers.

### Node validation

MCP tool layer validates node_id. Non-existent node returns error. Disabled nodes can still be tested (useful for debugging why it was disabled).

### Timeouts

| Operation | Timeout |
|-----------|---------|
| Single API call | 10s |
| TCP handshake | 5s |
| Globalping measurement (polling) | 30s |

## Future Extensions

- SSH-based providers (MTR, NextTrace, iperf3 on nodes)
- Scheduled diagnostics with history storage
- Certificate expiry alerts
- Latency trend tracking
