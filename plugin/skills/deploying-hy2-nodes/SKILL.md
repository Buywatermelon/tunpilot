---
name: deploying-hy2-nodes
description: Use when deploying a new Hysteria2 proxy node, configuring TLS certificates, registering nodes in TunPilot, or performing node operations.
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

**Prerequisite**: TunPilot server must be running and CLI must be configured (use `getting-started` skill if not).

---

## Phase 1: Gather Information & Probe Server

### 1.1 Ask the User

Collect the following from the user:

- **SSH destination**: e.g. `root@node1.example.com`
- **Domain name** (optional): A domain pointing to this server's IP. If none, self-signed certs will be used.
- **Node name**: A human-readable label (e.g. `tokyo-01`, `bwg-us`)

### 1.2 Test SSH Connectivity

```bash
ssh <server> "echo ok"
```

### 1.3 Probe Server Capabilities

Run ALL probes in a single SSH session to minimize round trips:

```bash
ssh <server> bash <<'PROBE'
echo "=== OS/ARCH ==="
uname -s -m
cat /etc/os-release 2>/dev/null | grep -E '^(ID|VERSION_ID)='

echo "=== CPU ==="
nproc

echo "=== MEMORY ==="
free -b | awk '/Mem/{print $2}'

echo "=== PORT CONFLICTS ==="
ss -tulnp | grep -E ':443|:80' || echo "no conflicts"

echo "=== FIREWALL ==="
if command -v ufw &>/dev/null; then echo "ufw"; ufw status 2>/dev/null
elif command -v firewall-cmd &>/dev/null; then echo "firewalld"; firewall-cmd --state 2>/dev/null
elif command -v nft &>/dev/null; then echo "nftables"
else echo "none"
fi

echo "=== EXISTING HY2 ==="
hysteria version 2>/dev/null || echo "not installed"

echo "=== NETWORK ==="
ip -4 addr show scope global 2>/dev/null
ip -6 addr show scope global 2>/dev/null

echo "=== SYSCTL ==="
sysctl -n net.core.rmem_max 2>/dev/null
sysctl -n net.core.wmem_max 2>/dev/null
sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null
sysctl -n net.core.default_qdisc 2>/dev/null
PROBE
```

### 1.4 Build Server Profile

Using the probe results, build a server profile table:

| Parameter | Source | Derived Setting |
|-----------|--------|-----------------|
| Memory | `free -b` | QUIC receive/send window size (Memory < 4 GB: 8 MB windows, Memory >= 4 GB: 16 MB windows) |
| CPU cores | `nproc` | maxStreams (cores x 256, cap at 1024) |
| Port conflicts | `ss -tulnp` | Whether to use alternative ports |
| Firewall type | probe | Which firewall commands to use (ufw/firewall-cmd/iptables/none) |
| Kernel tuning | sysctl values | Whether sysctl tuning is needed |
| IPv6 | `ip -6 addr` | Whether to enable dual-stack |

### 1.5 Confirm Choices with User

Present the server profile and confirm:

- **Congestion control**: Brutal (recommended for dedicated bandwidth) vs BBR (for shared/variable bandwidth)
- **Bandwidth limits**: Up/down values based on server specs
- **Masquerade site**: Default `https://www.bing.com/` or custom

---

## Phase 2: Deploy

### 2.1 Kernel Tuning

Apply QUIC-optimized sysctl settings. Skip if the probe shows values are already tuned.

```bash
ssh <server> bash <<'SYSCTL'
cat > /etc/sysctl.d/99-hysteria.conf << 'EOF'
# QUIC/UDP buffer sizes (official Hysteria2 recommendation)
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216

# Queueing discipline (supports pacing needed by BBR)
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
EOF

sysctl -p /etc/sysctl.d/99-hysteria.conf
SYSCTL
```

### 2.2 Install / Upgrade Hysteria2

```bash
ssh <server> "bash <(curl -fsSL https://get.hy2.sh/)"
```

Verify installation:

```bash
ssh <server> "hysteria version"
```

### 2.3 Install Diagnostic Dependencies

Install tools required by the diagnostic scripts (IPQuality + NetQuality):

```bash
ssh <server> "apt-get update -qq && apt-get install -y -qq jq curl bc netcat-openbsd dnsutils iproute2 iperf3 mtr"
```

These are needed for the `testing-nodes` skill diagnostics (IPQuality + NetQuality) to work without prompting for interactive installation. NetQuality's remaining dependencies (`speedtest`, `nexttrace`) are auto-installed by the script's `-y` flag on first run.

### 2.3.1 Install Diagnostics Wrapper

Deploy the `tunpilot-diag` script for clean JSON diagnostics output:

```bash
ssh <server> bash <<'DIAG_INSTALL'
curl -fsSL https://raw.githubusercontent.com/Buywatermelon/tunpilot/main/scripts/tunpilot-diag.sh \
  -o /usr/local/bin/tunpilot-diag
chmod +x /usr/local/bin/tunpilot-diag
tunpilot-diag --version
DIAG_INSTALL
```

### 2.4 TLS Certificate

**Option A — With domain (ACME handled by Hysteria2 config):**

ACME is configured directly in the Hysteria2 `config.yaml` (see Phase 2.6). There is no separate `hysteria cert` command needed. Just ensure port 80 is open for the HTTP-01 challenge:

```bash
ssh <server> bash <<'ACME_PREP'
# Ensure port 80 is not occupied by another service
ss -tlnp | grep ':80 ' && echo "WARNING: port 80 in use — ACME may fail" || echo "port 80 available"
mkdir -p /etc/hysteria
ACME_PREP
```

**Option B — Without domain (self-signed EC P-256):**

```bash
ssh <server> bash <<'SELFSIGN'
mkdir -p /etc/hysteria
openssl req -x509 -newkey ec \
  -pkeyopt ec_paramgen_curve:prime256v1 \
  -keyout /etc/hysteria/key.pem \
  -out /etc/hysteria/cert.pem \
  -days 3650 -nodes \
  -subj '/CN=bing.com'
SELFSIGN
```

### 2.5 Register Node in TunPilot

Use the CLI to register the node:

```bash
tunpilot node add \
  --name=<node-name> \
  --host=<server-ip-or-domain> \
  --port=443 \
  --protocol=hysteria2 \
  --stats_port=9999 \
  --stats_secret=<random-string> \
  --sni=<domain> \
  --insecure=1
```

Required flags: `--name`, `--host`, `--port`, `--protocol`

Optional flags: `--stats_port`, `--stats_secret`, `--sni`, `--cert_path`, `--ssh_user`, `--ssh_port`, `--insecure` (1 for self-signed, 0 for ACME)

**Save the returned node ID and `auth_callback_url`** from the JSON output.

### 2.6 Write Production Config

Read the config template from `hysteria2-template.md` in this skill directory. Choose the appropriate config variant:

- **Config A (ACME / with domain)**: Uses `acme` block for automatic certificate management
- **Config B (Self-signed / no domain)**: Uses `cert` and `key` paths directly

Fill all placeholders using values from the server profile built in Phase 1.4. Write the config:

```bash
ssh <server> "cat > /etc/hysteria/config.yaml << 'CONF'
<filled config from template>
CONF"
```

Adjust `bandwidth` based on the server's actual network capacity and the user's confirmed choices from Phase 1.5.

### 2.7 Systemd Hardening

Create a systemd drop-in to harden the Hysteria2 service:

```bash
ssh <server> bash <<'SYSTEMD'
mkdir -p /etc/systemd/system/hysteria-server.service.d

cat > /etc/systemd/system/hysteria-server.service.d/hardening.conf << 'EOF'
[Service]
LimitNOFILE=65536
NoNewPrivileges=true
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW
CapabilityBoundingSet=CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/etc/hysteria
EOF

systemctl daemon-reload
SYSTEMD
```

### 2.8 Firewall

Open required ports using the firewall type detected in Phase 1.3:

```bash
ssh <server> bash <<'FIREWALL'
# Detect and apply firewall rules
if command -v ufw &>/dev/null; then
  ufw allow 443/udp
  ufw allow 443/tcp
  ufw allow 80/tcp
  ufw reload
elif command -v firewall-cmd &>/dev/null; then
  firewall-cmd --permanent --add-port=443/udp
  firewall-cmd --permanent --add-port=443/tcp
  firewall-cmd --permanent --add-port=80/tcp
  firewall-cmd --reload
else
  echo "No firewall manager detected — ensure UDP/443, TCP/443, TCP/80 are open at the provider level"
fi
FIREWALL
```

### 2.9 Start Service

```bash
ssh <server> "systemctl enable --now hysteria-server && sleep 2 && systemctl is-active hysteria-server"
```

If the service fails to start, check logs immediately:

```bash
ssh <server> "journalctl -u hysteria-server --no-pager -n 50"
```

---

## Phase 3: Verify

### 3.1 Health Check

Use the CLI to check node health:

```bash
tunpilot health
```

### 3.2 Masquerade Test

Only if a domain was configured — verify the masquerade proxy is working:

```bash
curl -I https://<domain>
```

The response should show headers from the masquerade target (e.g. Bing).

### 3.3 Stats API Test

Test the traffic stats API from the node itself via SSH:

```bash
ssh <server> "curl -s -H 'Authorization: <stats_secret>' http://127.0.0.1:9999/online"
```

This should return a JSON response with online user count.

### 3.4 Log Check

Review recent logs for any errors or warnings:

```bash
ssh <server> "journalctl -u hysteria-server --no-pager -n 30 --since '5 minutes ago'"
```

### 3.5 Deployment Summary

Present a final report to the user:

- Node name and ID
- Server IP and domain (if any)
- Protocol and port
- TLS type (ACME or self-signed)
- Congestion control and bandwidth limits
- Kernel tuning applied
- Health check result
- Subscription instructions (use `tunpilot user update <id> --nodes=<node-id>` to grant users access)

---

## Troubleshooting

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| `tunpilot health` unreachable | Stats API not accessible | Verify `stats_port` and `stats_secret` match between TunPilot and the node config |
| Service won't start | Config syntax error | Run `journalctl -u hysteria-server --no-pager -n 50` and validate YAML syntax |
| ACME cert fails | DNS not pointing to server | Check `dig <domain>`, ensure port 80 is open and not occupied |
| Clients can't connect | Firewall blocking UDP/443 | Check `ss -ulnp | grep 443`, test with `nc -u <ip> 443` |
| Slow speeds | Wrong congestion control | Check Brutal bandwidth setting matches actual capacity, try switching to BBR |
| Auth failures | Callback URL unreachable | Run `curl <auth_callback_url>` from the node to verify TunPilot is reachable |

---

## CLI Commands Reference

| Command | Use When |
|---------|----------|
| `tunpilot node list` | See all registered nodes |
| `tunpilot node add --name=... --host=... --port=... --protocol=...` | Register a new node (Phase 2.5) |
| `tunpilot node update <id> --name=...` | Change node config (port, SNI, enable/disable) |
| `tunpilot node remove <id>` | Delete a node (cascades user assignments) |
| `tunpilot node sync` | Sync all node configurations |
| `tunpilot health` | Verify all nodes are reachable |
| `tunpilot traffic --node=<id>` | Query traffic usage by node |
| `tunpilot user update <id> --nodes=<id1>,<id2>` | Grant a user access to specific nodes |
| `tunpilot sub create --user=<id> --format=surge` | Generate client subscription link for a user |
