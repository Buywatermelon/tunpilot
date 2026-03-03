# Skills Deep Optimization Design

Date: 2026-03-04

## Context

During a live node quality testing session, 4 layers of failure were observed:
1. MCP tool not available (server not updated — ops issue, not code)
2. SSH auth failed (SSH config complexity)
3. Dependencies not installed on nodes (deploying-nodes skill doesn't install them)
4. Results lost after expensive 2-3 minute run (no caching — but low frequency, so acceptable)

Root cause analysis from first principles revealed:
- **The code/MCP layer is already well-architected** — atomic, stateful, simple
- **The skills layer is where optimization belongs** — orchestration, analysis, best practices
- **Strong models can infer observability from raw data** — no need for dedicated analytics tools

Architecture principle: MCP = atomic tools, Skills = orchestration + intelligence, Model = inference.

## Changes

### A. testing-nodes/SKILL.md — Major Overhaul

**Current problems:**
- Phase 4 recommendations are generic (5 bullet points)
- No score interpretation baselines
- No IP type classification explanation
- No multi-node comparison format
- No troubleshooting section
- Missing prerequisite about dependencies

**Changes:**

1. **Add Phase 0: Prerequisites** — verify deps are installed, provide install command if not

2. **Rewrite Phase 3: Score Interpretation Guide**
   - IP2LOCATION: 0-20 low risk, 20-80 medium, 80-100 high risk
   - SCAMALYTICS: 0-20 low, 20-50 medium, 50+ high
   - AbuseIPDB: 0-10 low, 10-50 medium, 50+ high
   - IPQS: 0-30 low, 30-75 medium, 75+ high (null = unreachable)
   - ipapi: <1% low, 1-10% medium, 10%+ high
   - DBIP: 0 clean, 1+ flagged

3. **Add IP Type Classification Knowledge Base**
   - 家宽 (residential): Best quality, least detection, ideal for streaming
   - 商业 (business/commercial): Good quality, some services may restrict
   - 机房 (datacenter/hosting): Most detected, streaming services likely restrict
   - 原生IP vs 广播IP: Native IP registered to local ISP vs anycast/broadcast

4. **Add Detection Factor Analysis Patterns**
   - 0/9 flagged = clean IP, excellent quality
   - 1-2/9 flagged = borderline, likely false positive, usually fine
   - 3-5/9 flagged = moderate risk, some services will flag
   - 6+/9 flagged = high risk, most services will detect and restrict

5. **Add Multi-Node Comparison Template**
   - Side-by-side table format for all tested nodes
   - Highlight best/worst per category
   - Overall recommendation with reasoning

6. **Rewrite Phase 4: Detailed Analysis Patterns**
   - Replace generic bullets with specific analysis patterns
   - "Datacenter IP + 3+ VPN flags + Netflix blocked = expected behavior, consider residential IP"
   - "Residential IP + 0 flags + all media unlocked = excellent quality"
   - "Mixed usage classification = IP is borderline, quality may degrade over time"

7. **Add Troubleshooting Section**
   - SSH connection refused / auth failed
   - Script timeout (>120s)
   - "Invalid input, script exited" — dependencies not installed
   - No JSON in output — script version incompatibility

### B. deploying-nodes/SKILL.md — Add Diagnostics Dependencies

**Change:** Add step after Phase 2.2 (Install Hysteria2):

```bash
ssh <server> "apt-get update -qq && apt-get install -y -qq jq curl bc netcat-openbsd dnsutils iproute2"
```

Purpose: Ensure the IPQuality diagnostic script can run without prompting for dependency installation.

### C. getting-started/SKILL.md — Fix Tool References

**Changes:**
1. Update "What's Next" section: 16 tools → 21 tools, 4 categories → 6 categories
2. Remove references to non-existent tools: `get_node_info`, `get_cert_status`
3. Add missing categories: Settings (3 tools), Diagnostics (1 tool)
4. Correct tool list:
   - Nodes (4): list_nodes, add_node, update_node, remove_node
   - Users (7): list_users, create_user, update_user, delete_user, reset_traffic, assign_nodes, list_user_nodes
   - Subscriptions (4): generate_subscription, list_subscriptions, delete_subscription, get_subscription_config
   - Monitoring (2): check_health, get_traffic_stats
   - Settings (3): set_setting, list_settings, delete_setting
   - Diagnostics (1): test_node_ipquality

### D. deploying-nodes/SKILL.md — Fix Tool References

**Changes:**
1. Remove references to `get_node_info` and `get_cert_status` from MCP Tools Reference table
2. Update to match actual available tools

### E. ipquality.ts — Respect SSH Config

**Current:** Uses `-o StrictHostKeyChecking=no` which overrides user's SSH config.

**Change:** Remove the flag so the system SSH config is respected. If the user has `StrictHostKeyChecking=yes` with a known hosts file, that should be honored.

```typescript
// Before
["ssh", "-p", String(sshPort), "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10", ...]

// After
["ssh", "-p", String(sshPort), "-o", "ConnectTimeout=10", ...]
```

Note: The `-o ConnectTimeout=10` is still useful as a safety net.

## Non-Changes (YAGNI)

The following were considered but explicitly rejected:

- **Diagnostics caching** — Low frequency operation, not worth the complexity
- **Composite MCP tools** (quick_setup_user) — Skills handle orchestration, MCP stays atomic
- **Traffic analytics tools** — Strong models infer from existing `get_traffic_stats(from, to)`
- **Node readiness tracking** — Deployment skill ensures readiness, no need for runtime tracking
- **Preflight service** — Over-engineering; just install deps at deployment time

## Implementation Order

1. testing-nodes/SKILL.md overhaul (highest impact — directly addresses the conversation pain point)
2. deploying-nodes/SKILL.md deps + tool refs fix
3. getting-started/SKILL.md tool refs fix
4. ipquality.ts SSH config fix (small code change)
