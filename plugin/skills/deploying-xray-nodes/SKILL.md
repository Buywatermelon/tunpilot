---
name: deploying-xray-nodes
description: Use when deploying a new Xray-core Trojan proxy node, configuring TLS certificates with certificate pinning, or registering Trojan nodes in TunPilot.
metadata:
  openclaw:
    requires:
      bins:
        - ssh
    emoji: "🛰️"
    homepage: https://github.com/Buywatermelon/tunpilot
---

# TunPilot Xray-core Node Deployment (Production-Optimized)

Deploy a production-grade Xray-core Trojan proxy node with automatic performance tuning, security hardening, and certificate fingerprint pinning. Follow each phase in order.

**Prerequisite**: TunPilot server must be running and MCP must be connected (use `getting-started` skill if not).

---

## Phase 1: Gather Information & Probe Server

### 1.1 Ask the User

Collect the following from the user:

- **SSH destination**: e.g. `root@node1.example.com` or an SSH config alias
- **Domain name** (optional): A domain pointing to this server's IP. If none, self-signed certs with fingerprint pinning will be used.
- **Node name**: A human-readable label (e.g. `tokyo-trojan`, `bwg-trojan`)

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

echo "=== EXISTING XRAY ==="
xray version 2>/dev/null || echo "not installed"

echo "=== NETWORK ==="
ip -4 addr show scope global 2>/dev/null
ip -6 addr show scope global 2>/dev/null

echo "=== SYSCTL ==="
sysctl -n net.core.rmem_max 2>/dev/null
sysctl -n net.core.wmem_max 2>/dev/null
sysctl -n net.core.somaxconn 2>/dev/null
sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null
sysctl -n net.core.default_qdisc 2>/dev/null
sysctl -n net.ipv4.tcp_fastopen 2>/dev/null
PROBE
```

### 1.4 Build Server Profile

Using the probe results, build a server profile table:

| Parameter | Source | Derived Setting |
|-----------|--------|-----------------|
| Memory | `free -b` | TCP buffer sizes (rmem/wmem) |
| CPU cores | `nproc` | Connection capacity |
| Port conflicts | `ss -tulnp` | Whether 443/TCP and 80/TCP are available |
| Firewall type | probe | Which firewall commands to use (ufw/firewall-cmd/iptables/none) |
| Kernel tuning | sysctl values | Whether TCP sysctl tuning is needed (BBR, somaxconn, fastopen) |
| Existing Xray | version check | Whether to install fresh or upgrade |

### 1.5 Confirm Choices with User

Present the server profile and confirm:

- **TLS strategy**: ACME (requires domain) vs self-signed + fingerprint pinning (no domain needed)
- **Fallback site**: What to serve on port 80 for non-Trojan traffic (default: install nginx with a basic page, or skip)
- **gRPC API port**: Default `10085` for Xray stats API

---

## Phase 2: Deploy

### 2.1 Kernel Tuning

Apply TCP-optimized sysctl settings. Skip if the probe shows values are already tuned.

```bash
ssh <server> bash <<'SYSCTL'
cat > /etc/sysctl.d/99-xray.conf << 'EOF'
# TCP buffer sizes
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216

# Connection backlog
net.core.somaxconn = 4096

# TCP Fast Open (client + server)
net.ipv4.tcp_fastopen = 3

# BBR congestion control
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
EOF

sysctl -p /etc/sysctl.d/99-xray.conf
SYSCTL
```

### 2.2 Install Xray-core

```bash
ssh <server> 'bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install'
```

Verify installation:

```bash
ssh <server> "xray version"
```

### 2.3 Install Diagnostic Dependencies

Install tools required by the diagnostic scripts (IPQuality + NetQuality):

```bash
ssh <server> "apt-get update -qq && apt-get install -y -qq jq curl bc netcat-openbsd dnsutils iproute2 iperf3 mtr"
```

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

**Config A — With domain (ACME via standalone or webroot):**

Use certbot or acme.sh to obtain a Let's Encrypt certificate independently of Xray. This keeps certificate management separate from the proxy:

```bash
ssh <server> bash <<'ACME'
# Install certbot if not present
command -v certbot &>/dev/null || apt-get install -y certbot

# Ensure port 80 is free for HTTP-01 challenge
ss -tlnp | grep ':80 ' && echo "WARNING: port 80 in use — stop the service first" || echo "port 80 available"

# Obtain certificate (standalone mode — no web server needed)
certbot certonly --standalone -d {{DOMAIN}} --non-interactive --agree-tos --email admin@{{DOMAIN}}

# Set up auto-renewal with Xray restart
mkdir -p /etc/xray
ln -sf /etc/letsencrypt/live/{{DOMAIN}}/fullchain.pem /etc/xray/cert.pem
ln -sf /etc/letsencrypt/live/{{DOMAIN}}/privkey.pem /etc/xray/key.pem

# Add post-renewal hook to restart Xray
cat > /etc/letsencrypt/renewal-hooks/post/restart-xray.sh << 'HOOK'
#!/bin/bash
systemctl restart xray
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/post/restart-xray.sh
ACME
```

**Config B — Without domain (self-signed EC P-256 + fingerprint pinning):**

```bash
ssh <server> bash <<'SELFSIGN'
mkdir -p /etc/xray
openssl req -x509 -newkey ec \
  -pkeyopt ec_paramgen_curve:prime256v1 \
  -keyout /etc/xray/key.pem \
  -out /etc/xray/cert.pem \
  -days 3650 -nodes \
  -subj '/CN=bing.com'

# Calculate SHA-256 fingerprint for certificate pinning
echo "=== Certificate SHA-256 Fingerprint ==="
openssl x509 -in /etc/xray/cert.pem -noout -fingerprint -sha256 | sed 's/://g' | cut -d= -f2
SELFSIGN
```

**Save the fingerprint** — it will be used when registering the node in TunPilot and is included in subscription configs for clients to verify the certificate.

### 2.5 Register Node in TunPilot

Use the `add_node` MCP tool. This returns the `auth_callback_url` (though Trojan/Xray uses gRPC sync rather than HTTP auth callback).

Required parameters:

- `name`: the node name from Phase 1.1
- `host`: the server's IP or domain
- `port`: `443`
- `protocol`: `trojan`

Recommended optional parameters:

- `stats_port`: `10085` (Xray gRPC API port)
- `sni`: the domain name (if using ACME)
- `cert_path`: `/etc/xray/cert.pem`
- `ssh_user`: `root`
- `ssh_port`: `22`
- `ssh_alias`: SSH config alias if configured
- `insecure`: `1` if using self-signed certificates (Config B), `0` if using ACME (Config A)
- `cert_fingerprint`: SHA-256 fingerprint from step 2.4 (Config B only, hex string without colons)

### 2.6 Write Xray JSON Config

Read the config template from `xray-template.md` in this skill directory. Choose the appropriate config variant:

- **Config A (ACME / with domain)**: Certificate paths point to Let's Encrypt symlinks
- **Config B (Self-signed / no domain)**: Certificate paths point to self-signed certs

Fill all placeholders using values from the server profile. Write the config:

```bash
ssh <server> "cat > /usr/local/etc/xray/config.json << 'CONF'
<filled config from template>
CONF"
```

### 2.7 Systemd Hardening

Create a systemd drop-in to harden the Xray service:

```bash
ssh <server> bash <<'SYSTEMD'
mkdir -p /etc/systemd/system/xray.service.d

cat > /etc/systemd/system/xray.service.d/hardening.conf << 'EOF'
[Service]
LimitNOFILE=65536
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/usr/local/etc/xray /etc/xray
EOF

systemctl daemon-reload
SYSTEMD
```

### 2.8 Firewall

Open required ports using the firewall type detected in Phase 1.3. Trojan uses TCP (not UDP like Hysteria2):

```bash
ssh <server> bash <<'FIREWALL'
if command -v ufw &>/dev/null; then
  ufw allow 443/tcp
  ufw allow 80/tcp
  ufw reload
elif command -v firewall-cmd &>/dev/null; then
  firewall-cmd --permanent --add-port=443/tcp
  firewall-cmd --permanent --add-port=80/tcp
  firewall-cmd --reload
else
  echo "No firewall manager detected — ensure TCP/443 and TCP/80 are open at the provider level"
fi
FIREWALL
```

### 2.9 Start Service & Sync Users

```bash
ssh <server> "systemctl enable --now xray && sleep 2 && systemctl is-active xray"
```

If the service fails to start, check logs immediately:

```bash
ssh <server> "journalctl -u xray --no-pager -n 50"
```

After the service is running, use the `sync_xray_nodes` MCP tool to push all assigned users to the node via gRPC.

---

## Phase 3: Verify

### 3.1 Health Check

Use the `check_health` MCP tool to confirm the node is registered and reachable.

### 3.2 gRPC API Connectivity Test

Test the Xray gRPC stats API from the node itself via SSH:

```bash
ssh <server> "xray api statsquery --server=127.0.0.1:{{API_PORT}}"
```

This should return stats output (may be empty if no traffic yet).

### 3.3 Log Check

Review recent logs for any errors or warnings:

```bash
ssh <server> "journalctl -u xray --no-pager -n 30 --since '5 minutes ago'"
```

### 3.4 Deployment Summary

Present a final report to the user:

- Node name and ID
- Server IP and domain (if any)
- Protocol (Trojan) and port
- TLS type (ACME or self-signed with fingerprint)
- Certificate fingerprint (if self-signed)
- gRPC API port
- Kernel tuning applied
- Health check result
- Subscription instructions (use `assign_nodes` to grant users access, then `sync_xray_nodes` to push users)

---

## Troubleshooting

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| `check_health` unreachable | gRPC API not accessible | Verify `stats_port` matches Xray config `api.listen` port, check SSH connectivity |
| Service won't start | Config syntax error | Run `journalctl -u xray --no-pager -n 50` and validate JSON syntax with `xray run -test -c /usr/local/etc/xray/config.json` |
| ACME cert fails | DNS not pointing to server | Check `dig <domain>`, ensure port 80 is open and not occupied |
| Clients can't connect | Firewall blocking TCP/443 | Check `ss -tlnp | grep 443`, test with `nc -z <ip> 443` |
| gRPC sync fails | Xray API not listening | Verify `api` block in config, check `ss -tlnp | grep {{API_PORT}}` |
| Auth failures | Users not synced | Run `sync_xray_nodes` MCP tool to push users to the node |
| Certificate pinning errors | Fingerprint mismatch | Re-extract fingerprint: `openssl x509 -in /etc/xray/cert.pem -noout -fingerprint -sha256` and update via `update_node` |

---

## MCP Tools Reference

| Tool | Use When |
|------|----------|
| `list_nodes` | See all registered nodes |
| `add_node` | Register a new node (Phase 2.5) — use `protocol: "trojan"` |
| `update_node` | Change node config (port, SNI, fingerprint, enable/disable) |
| `remove_node` | Delete a node (cascades user assignments) |
| `check_health` | Verify all nodes are reachable |
| `sync_xray_nodes` | Push users to Trojan nodes via gRPC (Phase 2.9) |
| `get_traffic_stats` | Query traffic usage by node or user |
| `assign_nodes` | Grant a user access to specific nodes |
| `generate_subscription` | Generate client subscription link for a user |
