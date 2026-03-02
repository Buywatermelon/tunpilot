# Hysteria2 Deployment Optimization Design

## Goal

Upgrade `deploying-nodes` skill from a basic 8-step manual runbook (v0.2) to a smart, auto-optimizing deployment system (v1.0) that produces production-grade Hysteria2 nodes with a single SSH + domain input.

## Architecture: Smart Single Skill (4 Phases)

```
User Input: SSH + Domain (optional)
        │
   Phase 1: Probe Server
   ├─ OS/arch, CPU cores, memory
   ├─ Bandwidth estimation
   ├─ Port 443/80 conflict check
   ├─ Firewall type detection
   ├─ Existing hy2 detection
   ├─ IPv4/IPv6 dual-stack check
   └─ Current sysctl values
        │
   Phase 2: Auto-Configure
   ├─ BBR vs Brutal selection
   ├─ QUIC window calculation (2:5 ratio)
   ├─ Port strategy (443 + optional hop)
   ├─ TLS strategy (ACME built-in vs self-signed)
   ├─ Masquerade config (proxy + TCP layer)
   ├─ DNS resolver (DoH)
   └─ SNI Guard mode
        │
   Phase 3: Deploy
   ├─ Kernel tuning (sysctl)
   ├─ Install/upgrade Hysteria2
   ├─ TLS certificate setup
   ├─ Register node in TunPilot (MCP)
   ├─ Write production config
   ├─ Systemd hardening
   ├─ Firewall + port hopping
   └─ Start service
        │
   Phase 4: Verify
   ├─ check_health MCP tool
   ├─ Masquerade probe (curl)
   ├─ Stats API test
   ├─ Journal log check
   └─ Deployment summary report
```

## Phase 1: Server Probing

All detection via SSH. Output is a "server profile" dict consumed by Phase 2.

| Probe          | Command                                  | Decision Impact             |
|----------------|------------------------------------------|-----------------------------|
| OS/Arch        | `uname -s -m; cat /etc/os-release`       | Package manager, hy2 binary |
| CPU cores      | `nproc`                                  | maxIncomingStreams           |
| Memory         | `free -b \| awk '/Mem/{print $2}'`       | QUIC receive windows        |
| Port conflicts | `ss -tulnp \| grep -E ':443\|:80'`      | Port strategy               |
| Firewall       | detect ufw/firewall-cmd/nftables/iptables| Rule syntax                 |
| Existing hy2   | `hysteria version 2>/dev/null`           | Upgrade vs fresh install    |
| Network        | `ip -4 addr; ip -6 addr`                | Dual-stack config           |
| Bandwidth      | `curl` speed test or user-provided       | BBR vs Brutal               |
| Current sysctl | `sysctl net.core.rmem_max` etc           | Skip if already tuned       |

## Phase 2: Auto-Configuration Decision Logic

### Congestion Control
- **BBR** (default): Omit `bandwidth` section entirely. Best for shared VPS, unknown bandwidth.
- **Brutal**: Only when user explicitly provides bandwidth AND network is lossy. Set `bandwidth.up` and `bandwidth.down` per user input.
- Agent recommends BBR by default, explains trade-off, lets user override.

### QUIC Parameters
- Stream:Connection receive window = 2:5 ratio (official recommendation)
- Default: 8MB stream / 20MB connection
- High memory (≥4GB): 16MB stream / 40MB connection
- `maxIncomingStreams`: min(1024, CPU_cores * 256)
- `maxIdleTimeout`: 30s default

### Port Strategy
- Port 443 free → use 443 + optional port hopping (iptables DNAT 20000-50000 → 443)
- Port 443 occupied → prompt user: stop existing service OR use alternate port
- Port hopping rules persisted via netfilter-persistent or nftables config

### TLS Strategy
- **With domain**: ACME built into hy2 config.yaml (not `hysteria cert` CLI). Auto-renewal, zero maintenance.
- **Without domain**: Self-signed EC P-256 cert, `insecure: 1` in TunPilot node record.

### Masquerade
- Proxy mode → `https://www.bing.com/` (high-traffic CDN site)
- TCP masquerade: `listenHTTP: :80`, `listenHTTPS: :443`, `forceHTTPS: true`
- SNI Guard: `strict` with domain, `disable` without

### DNS
- DoH resolver: `1.1.1.1:443` (Cloudflare) to prevent DNS leaks

### Stats API
- Bind to `127.0.0.1:9999` (not 0.0.0.0) for security

## Phase 3: Deployment Steps

### 3.1 Kernel Tuning
```bash
cat > /etc/sysctl.d/99-hysteria.conf << 'EOF'
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
net.core.somaxconn = 4096
net.core.netdev_max_backlog = 16384
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.tcp_tw_reuse = 1
EOF
sysctl -p /etc/sysctl.d/99-hysteria.conf
```

### 3.2 Install Hysteria2
```bash
bash <(curl -fsSL https://get.hy2.sh/)
```

### 3.3 TLS Certificate
ACME (in config.yaml) or self-signed (openssl ecparam).

### 3.4 Register Node in TunPilot
MCP `add_node` → get `auth_callback_url`.

### 3.5 Production Config
Full config with all Phase 2 decisions applied. See template below.

### 3.6 Systemd Hardening
```ini
# /etc/systemd/system/hysteria-server.service.d/hardening.conf
[Service]
LimitNOFILE=65536
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/etc/hysteria
```

### 3.7 Firewall
- UDP/443, TCP/80, TCP/443
- Optional DNAT port hopping + persistence
- Stats API port NOT exposed externally

### 3.8 Start Service
```bash
systemctl daemon-reload
systemctl enable --now hysteria-server
```

## Phase 4: Verification

1. `check_health` MCP → node online
2. `curl -I https://<host>` → masquerade response
3. `curl http://127.0.0.1:9999/online` via SSH → stats API working
4. `journalctl -u hysteria-server --no-pager -n 20` → no errors
5. Print deployment summary with all config choices

## Production Config Template

```yaml
listen: :443

# TLS — ACME (with domain)
acme:
  domains:
    - {{DOMAIN}}
  email: admin@{{DOMAIN}}

# TLS — Self-signed (without domain)
# tls:
#   cert: /etc/hysteria/cert.pem
#   key: /etc/hysteria/key.pem

tls:
  sniGuard: {{SNI_GUARD}}  # strict | disable

quic:
  initStreamReceiveWindow: {{STREAM_WINDOW}}
  maxStreamReceiveWindow: {{STREAM_WINDOW}}
  initConnReceiveWindow: {{CONN_WINDOW}}
  maxConnReceiveWindow: {{CONN_WINDOW}}
  maxIdleTimeout: 30s
  maxIncomingStreams: {{MAX_STREAMS}}
  disablePathMTUDiscovery: false

# Bandwidth — only present when using Brutal
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
```

## Files Changed

1. `skills/deploying-nodes/SKILL.md` — Complete rewrite with 4-phase smart deployment
2. `skills/deploying-nodes/hysteria2-template.md` — Expanded production template with all optimization parameters
3. Sync to `plugin/skills/` and `openclaw/skills/`
