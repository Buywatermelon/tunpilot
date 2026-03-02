# Hysteria2 Deployment Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite the `deploying-nodes` skill from a basic 8-step manual runbook to a smart 4-phase auto-optimizing deployment system that produces production-grade Hysteria2 nodes.

**Architecture:** Single skill with 4 sequential phases (Probe → Configure → Deploy → Verify). Agent SSH-probes the server, auto-selects optimal parameters (congestion control, QUIC windows, port strategy, TLS, masquerade), then deploys with kernel tuning, systemd hardening, and full verification.

**Tech Stack:** Skill markdown (SKILL.md + hysteria2-template.md), SSH commands, MCP tools (add_node, check_health)

---

### Task 1: Rewrite hysteria2-template.md with production config

**Files:**
- Modify: `skills/deploying-nodes/hysteria2-template.md`

**Step 1: Replace the template with the full production config**

Replace the entire file with the expanded template covering all optimization parameters:

```markdown
# Hysteria2 Production Configuration Template

Replace `{{PLACEHOLDER}}` values based on server probe results before deploying.

## Config A — With Domain (ACME auto-TLS)

\```yaml
listen: :443

acme:
  domains:
    - {{DOMAIN}}
  email: admin@{{DOMAIN}}

tls:
  sniGuard: strict

quic:
  initStreamReceiveWindow: {{STREAM_WINDOW}}
  maxStreamReceiveWindow: {{STREAM_WINDOW}}
  initConnReceiveWindow: {{CONN_WINDOW}}
  maxConnReceiveWindow: {{CONN_WINDOW}}
  maxIdleTimeout: 30s
  maxIncomingStreams: {{MAX_STREAMS}}
  disablePathMTUDiscovery: false

# Bandwidth — ONLY include this section when using Brutal mode.
# Omit entirely for BBR (recommended default).
# bandwidth:
#   up: {{BANDWIDTH_UP}}
#   down: {{BANDWIDTH_DOWN}}

auth:
  type: http
  http:
    url: {{AUTH_CALLBACK_URL}}

resolver:
  type: https
  https:
    addr: 1.1.1.1:443
    sni: cloudflare-dns.com
    timeout: 10s

masquerade:
  type: proxy
  proxy:
    url: https://www.bing.com/
    rewriteHost: true
  listenHTTP: :80
  listenHTTPS: :443
  forceHTTPS: true

trafficStats:
  listen: 127.0.0.1:{{STATS_PORT}}
  secret: {{STATS_SECRET}}
\```

## Config B — Without Domain (Self-signed cert)

\```yaml
listen: :443

tls:
  cert: /etc/hysteria/cert.pem
  key: /etc/hysteria/key.pem
  sniGuard: disable

quic:
  initStreamReceiveWindow: {{STREAM_WINDOW}}
  maxStreamReceiveWindow: {{STREAM_WINDOW}}
  initConnReceiveWindow: {{CONN_WINDOW}}
  maxConnReceiveWindow: {{CONN_WINDOW}}
  maxIdleTimeout: 30s
  maxIncomingStreams: {{MAX_STREAMS}}
  disablePathMTUDiscovery: false

auth:
  type: http
  http:
    url: {{AUTH_CALLBACK_URL}}

resolver:
  type: https
  https:
    addr: 1.1.1.1:443
    sni: cloudflare-dns.com
    timeout: 10s

masquerade:
  type: proxy
  proxy:
    url: https://www.bing.com/
    rewriteHost: true

trafficStats:
  listen: 127.0.0.1:{{STATS_PORT}}
  secret: {{STATS_SECRET}}
\```

## Placeholders

| Placeholder | Description | How to determine |
|---|---|---|
| `{{DOMAIN}}` | Domain pointing to this server | User input |
| `{{STREAM_WINDOW}}` | QUIC stream receive window (bytes) | Memory < 4GB: `8388608` (8MB). Memory ≥ 4GB: `16777216` (16MB) |
| `{{CONN_WINDOW}}` | QUIC connection receive window (bytes) | Memory < 4GB: `20971520` (20MB). Memory ≥ 4GB: `41943040` (40MB). Must be 2.5x stream window |
| `{{MAX_STREAMS}}` | Max concurrent QUIC streams | `min(1024, CPU_CORES * 256)` |
| `{{AUTH_CALLBACK_URL}}` | TunPilot auth callback URL | Returned by `add_node` MCP tool |
| `{{STATS_PORT}}` | Traffic stats API port | Default: `9999` |
| `{{STATS_SECRET}}` | Traffic stats API secret | Random hex string |
| `{{BANDWIDTH_UP}}` | Server upload limit (Brutal only) | User-provided, e.g. `200 mbps` |
| `{{BANDWIDTH_DOWN}}` | Server download limit (Brutal only) | User-provided, e.g. `100 mbps` |

## Decision Reference

### BBR vs Brutal
- **BBR (default)**: Omit `bandwidth` section entirely. Self-adapting, no config needed. Best for shared VPS or unknown bandwidth.
- **Brutal**: Add `bandwidth` section. Only when user knows exact bandwidth AND network is lossy (cross-border). Never overestimate.

### QUIC Window 2:5 Ratio
Stream and connection receive windows MUST maintain a 2:5 ratio. This prevents individual streams from monopolizing throughput. The values above follow this rule.

### Stats API Security
Always bind to `127.0.0.1`, not `0.0.0.0`. The stats API has no TLS and should never be exposed to the internet.

### Masquerade
- Config A (domain): Full masquerade with TCP layer (listenHTTP + listenHTTPS + forceHTTPS). Server appears as a real HTTPS website.
- Config B (no domain): Proxy masquerade only (no TCP layer, since there's no valid cert for HTTPS).
```

**Step 2: Verify template renders correctly**

Read the file back and confirm YAML is syntactically valid and all placeholders are documented.

**Step 3: Commit**

```bash
git add skills/deploying-nodes/hysteria2-template.md
git commit -m "feat: expand hy2 config template with production optimizations

Add QUIC tuning, DoH resolver, TCP masquerade, SNI Guard,
and decision reference for BBR/Brutal and QUIC windows."
```

---

### Task 2: Rewrite SKILL.md with 4-phase smart deployment

**Files:**
- Modify: `skills/deploying-nodes/SKILL.md`

**Step 1: Replace SKILL.md with the new 4-phase runbook**

Keep the YAML frontmatter but bump version to `1.0.0`. Replace the body with:

```markdown
---
name: deploying-nodes
description: Use when deploying a new Hysteria2 proxy node, configuring TLS certificates, registering nodes in TunPilot, or performing node operations.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins:
        - ssh
    emoji: "🛰️"
    homepage: https://github.com/Buywatermelon/tunpilot
---

# TunPilot Node Deployment (Production-Optimized)

Deploy a production-grade Hysteria2 proxy node with automatic performance tuning, security hardening, and censorship resistance. Follow each phase in order.

**Prerequisite**: TunPilot server must be running and MCP must be connected (use `getting-started` skill if not).

---

## Phase 1: Gather Information & Probe Server

### 1.1 Ask the user for:
- **Target server**: SSH destination (e.g. `root@1.2.3.4`)
- **Domain name** (optional): A domain pointing to this server's IP. Enables ACME auto-TLS + full masquerade. If no domain, will use self-signed certs.
- **Node name**: A human-readable label (e.g. `tokyo-01`, `us-west`)

### 1.2 Test SSH connectivity:
```bash
ssh <server> "echo ok"
```

### 1.3 Probe server capabilities:

Run all probes in a single SSH session:

```bash
ssh <server> "
echo '=== OS ==='
uname -s -m
cat /etc/os-release 2>/dev/null | grep -E '^(ID|VERSION_ID)='

echo '=== CPU ==='
nproc

echo '=== Memory ==='
free -b | awk '/Mem/{print \$2}'

echo '=== Ports ==='
ss -tulnp 2>/dev/null | grep -E ':443|:80' || echo 'none'

echo '=== Firewall ==='
command -v ufw >/dev/null && echo 'ufw' || command -v firewall-cmd >/dev/null && echo 'firewalld' || command -v nft >/dev/null && echo 'nftables' || echo 'none'

echo '=== Existing Hysteria ==='
hysteria version 2>/dev/null || echo 'not installed'

echo '=== Network ==='
ip -4 addr show scope global 2>/dev/null | grep inet | head -3
ip -6 addr show scope global 2>/dev/null | grep inet6 | head -3

echo '=== Sysctl ==='
sysctl -n net.core.rmem_max 2>/dev/null
sysctl -n net.core.wmem_max 2>/dev/null
sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null
"
```

### 1.4 Build server profile from probe results:

| Probe Result | Decision |
|---|---|
| Memory < 4GB | QUIC windows: 8MB stream / 20MB conn |
| Memory ≥ 4GB | QUIC windows: 16MB stream / 40MB conn |
| CPU cores | maxIncomingStreams = min(1024, cores × 256) |
| Port 443 occupied | Alert user — must resolve before continuing |
| Port 80 occupied | Skip TCP masquerade on port 80 |
| rmem_max < 16MB | Kernel tuning needed |
| Existing hy2 | Upgrade instead of fresh install |
| Firewall type | Use matching syntax (ufw/firewalld/nft/iptables) |

### 1.5 Confirm configuration choices with user:

Present the auto-detected configuration and ask the user to confirm or override:
- **Congestion control**: BBR (recommended default) or Brutal (if user provides bandwidth)
- **Port hopping**: Enable if user wants censorship resistance
- **QUIC parameters**: Auto-calculated from probe

---

## Phase 2: Deploy

### 2.1 Kernel tuning (if needed)

Skip if `rmem_max` is already ≥ 16777216.

```bash
ssh <server> "cat > /etc/sysctl.d/99-hysteria.conf << 'EOF'
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
net.core.somaxconn = 4096
net.core.netdev_max_backlog = 16384
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.tcp_tw_reuse = 1
EOF
sysctl -p /etc/sysctl.d/99-hysteria.conf"
```

### 2.2 Install / upgrade Hysteria2

```bash
ssh <server> "bash <(curl -fsSL https://get.hy2.sh/)"
```

Verify:
```bash
ssh <server> "hysteria version"
```

### 2.3 TLS certificate

**With domain (ACME — handled by Hysteria2 config):**

No manual cert steps needed. ACME is configured directly in the Hysteria2 config.yaml (Phase 2.5). Hysteria2 will automatically obtain and renew the certificate.

Ensure port 80 is open for HTTP-01 challenge:
```bash
ssh <server> "<firewall-allow-80-tcp>"
```

**Without domain (self-signed):**

```bash
ssh <server> "mkdir -p /etc/hysteria && openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -keyout /etc/hysteria/key.pem -out /etc/hysteria/cert.pem -days 3650 -nodes -subj '/CN=bing.com'"
```

### 2.4 Register node in TunPilot

Use the `add_node` MCP tool with:
- `name`: node name from Phase 1
- `host`: server IP or domain
- `port`: `443`
- `protocol`: `hysteria2`
- `stats_port`: `9999`
- `stats_secret`: generate a random string
- `sni`: domain name (if using ACME) or omit
- `insecure`: `1` if self-signed, `0` if ACME
- `cert_path`: `/etc/hysteria/cert.pem` (self-signed only)
- `ssh_user`: `root`
- `ssh_port`: `22`

**Save the returned `auth_callback_url`.**

### 2.5 Write production config

Read the config template from `hysteria2-template.md` in this skill directory. Choose Config A (domain) or Config B (no domain) based on user input.

Fill all `{{PLACEHOLDER}}` values using the server profile from Phase 1 and the auth_callback_url from Phase 2.4.

Write the config:
```bash
ssh <server> "cat > /etc/hysteria/config.yaml << 'CONF'
<filled template>
CONF"
```

### 2.6 Systemd hardening

```bash
ssh <server> "mkdir -p /etc/systemd/system/hysteria-server.service.d && cat > /etc/systemd/system/hysteria-server.service.d/hardening.conf << 'EOF'
[Service]
LimitNOFILE=65536
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/etc/hysteria
EOF
systemctl daemon-reload"
```

### 2.7 Firewall configuration

Open required ports using the detected firewall type:

**ufw:**
```bash
ssh <server> "ufw allow 443/udp && ufw allow 443/tcp && ufw allow 80/tcp"
```

**firewalld:**
```bash
ssh <server> "firewall-cmd --permanent --add-port=443/udp --add-port=443/tcp --add-port=80/tcp && firewall-cmd --reload"
```

**No firewall detected:** Skip this step.

**Optional — Port hopping (if user requested):**

```bash
ssh <server> "iptables -t nat -A PREROUTING -i eth0 -p udp --dport 20000:50000 -j REDIRECT --to-ports 443
ip6tables -t nat -A PREROUTING -i eth0 -p udp --dport 20000:50000 -j REDIRECT --to-ports 443"
```

Persist rules:
```bash
ssh <server> "apt-get install -y iptables-persistent 2>/dev/null && netfilter-persistent save || echo 'persist manually'"
```

Note: Replace `eth0` with the actual primary network interface detected during probe.

### 2.8 Start service

```bash
ssh <server> "systemctl enable --now hysteria-server && sleep 3 && systemctl is-active hysteria-server"
```

If it fails, diagnose:
```bash
ssh <server> "journalctl -u hysteria-server --no-pager -n 50"
```

**Common issues:**
- **Port 443 in use** — stop existing web server or change listen port
- **Certificate error** — verify cert files exist and are readable by hysteria user
- **ACME failure** — ensure domain DNS points to this server, port 80 is open
- **Auth callback unreachable** — ensure TunPilot server is reachable from the node

---

## Phase 3: Verify

### 3.1 Health check

Use the `check_health` MCP tool to confirm the node is online.

### 3.2 Masquerade test (if domain configured)

```bash
ssh <server> "curl -sI https://localhost --resolve '<domain>:443:127.0.0.1' -k 2>/dev/null | head -5"
```

Should return HTTP response from the masquerade target (Bing).

### 3.3 Stats API test

```bash
ssh <server> "curl -s -H 'Authorization: <stats_secret>' http://127.0.0.1:9999/online"
```

Should return JSON (possibly empty `{}` if no clients connected).

### 3.4 Log check

```bash
ssh <server> "journalctl -u hysteria-server --no-pager -n 20 --no-hostname"
```

Verify no error entries. Look for "server up and running" message.

### 3.5 Deployment summary

Report to user:
- Node name and host
- TLS mode (ACME / self-signed)
- Congestion control (BBR / Brutal)
- QUIC windows (stream / conn)
- Masquerade target
- Port hopping (enabled / disabled)
- Kernel tuning (applied / skipped)
- Systemd hardening (applied)
- Stats API (port, bound to 127.0.0.1)

---

## Troubleshooting

| Symptom | Diagnosis | Fix |
|---|---|---|
| `check_health` returns "unreachable" | Stats API not accessible from TunPilot | Verify stats_port/secret match between config and TunPilot. Check if node can reach TunPilot. |
| Service won't start | Config syntax error | `journalctl -u hysteria-server -n 50`. Validate YAML. |
| ACME cert fails | DNS not pointing to server | Check `dig <domain>`. Ensure port 80 is open. |
| Clients can't connect | Firewall blocking UDP/443 | `ss -ulnp \| grep 443`. Test with `nc -uzv <host> 443`. |
| Slow speeds | Wrong congestion control or bandwidth setting | Check if Brutal bandwidth is overestimated. Try switching to BBR. |
| Auth failures | Callback URL unreachable | `curl <auth_callback_url>` from node. Check TunPilot firewall. |

## MCP Tools Reference

| Tool | Use When |
|---|---|
| `list_nodes` | See all registered nodes |
| `get_node_info` | Inspect a specific node's details |
| `add_node` | Register a new node (Phase 2.4) |
| `update_node` | Change node config (port, SNI, enable/disable) |
| `remove_node` | Delete a node (cascades user assignments) |
| `check_health` | Verify all nodes are reachable (Phase 3.1) |
| `get_cert_status` | Check TLS certificate expiry dates |
| `get_traffic_stats` | Query traffic usage by node or user |
```

**Step 2: Verify the skill renders correctly**

Read the file back and confirm all phases, commands, and tables are properly formatted.

**Step 3: Commit**

```bash
git add skills/deploying-nodes/SKILL.md
git commit -m "feat: rewrite deploying-nodes skill with 4-phase smart deployment

Replace basic 8-step runbook with intelligent deployment:
- Phase 1: Auto-probe server (OS, CPU, memory, ports, firewall)
- Phase 2: Deploy with kernel tuning, ACME TLS, systemd hardening
- Phase 3: Verify health, masquerade, stats API, logs
- Add troubleshooting table and decision logic"
```

---

### Task 3: Sync skills to plugin distribution directory

**Files:**
- Modify: `plugin/skills/deploying-nodes/SKILL.md`
- Modify: `plugin/skills/deploying-nodes/hysteria2-template.md`

**Step 1: Copy updated skills to plugin directory**

```bash
cp skills/deploying-nodes/SKILL.md plugin/skills/deploying-nodes/SKILL.md
cp skills/deploying-nodes/hysteria2-template.md plugin/skills/deploying-nodes/hysteria2-template.md
```

**Step 2: Verify copies match**

```bash
diff skills/deploying-nodes/SKILL.md plugin/skills/deploying-nodes/SKILL.md
diff skills/deploying-nodes/hysteria2-template.md plugin/skills/deploying-nodes/hysteria2-template.md
```

Expected: no output (files are identical).

**Step 3: Commit**

```bash
git add plugin/skills/deploying-nodes/
git commit -m "chore: sync deploying-nodes skill to plugin directory"
```

---

### Task 4: Final review and verification

**Step 1: Verify all skill files are consistent**

Read all 4 files and confirm:
- `skills/deploying-nodes/SKILL.md` matches `plugin/skills/deploying-nodes/SKILL.md`
- `skills/deploying-nodes/hysteria2-template.md` matches `plugin/skills/deploying-nodes/hysteria2-template.md`
- Version in SKILL.md frontmatter is `1.0.0`
- All `{{PLACEHOLDER}}` values in the template have corresponding entries in the Placeholders table
- SKILL.md references "hysteria2-template.md" correctly in Phase 2.5

**Step 2: Run a mental walkthrough**

Trace through the skill as an agent would execute it:
1. User says "deploy a node on root@1.2.3.4 with domain proxy.example.com, name tokyo-01"
2. Agent runs Phase 1 probes → builds server profile
3. Agent presents config choices (BBR, QUIC windows, port hopping)
4. Agent executes Phase 2 steps in order
5. Agent runs Phase 3 verification
6. Agent reports summary

Confirm there are no missing steps or broken references.

**Step 3: No additional commit needed — just review**
