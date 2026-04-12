---
name: deploying-hy2-nodes
description: "Deploys UDP/QUIC Hysteria2 proxy nodes with Brutal or BBR congestion control, inline ACME (or self-signed EC P-256), HTTP masquerade, QUIC receive/send window tuning based on server memory, systemd hardening with CAP_NET_ADMIN, and HTTP auth callback registration in TunPilot. Use when deploying a new Hysteria2 node, choosing Brutal vs BBR, tuning QUIC windows, setting up masquerade, or switching between ACME and self-signed TLS. Not for Xray/Trojan — see deploying-xray-nodes."
metadata:
  openclaw:
    requires:
      bins:
        - ssh
    emoji: "🛰️"
    homepage: https://github.com/Buywatermelon/tunpilot
---

# TunPilot Hysteria2 Node Deployment

Deploy a production-grade Hysteria2 proxy node with automatic performance tuning, security hardening, and censorship resistance.

**Prerequisite:** TunPilot server running and `tunpilot` CLI configured (use `getting-started` skill if not). All TunPilot operations below go through the CLI — it wraps the REST API with the user's saved server + token.

**Auxiliary files (read when referenced below):**

- [hysteria2-template.md](hysteria2-template.md) — config templates (ACME / self-signed variants)
- [../_shared/DIAG_SETUP.md](../_shared/DIAG_SETUP.md) — diagnostic tooling install
- [../_shared/SYSTEMD_HARDENING.md](../_shared/SYSTEMD_HARDENING.md) — hardening drop-in template
- [../_shared/SSH_TROUBLESHOOTING.md](../_shared/SSH_TROUBLESHOOTING.md) — generic SSH/systemd issues

---

## Phase 1: Gather Information & Probe Server

### 1.1 Ask the User

- **SSH destination** — e.g. `root@node1.example.com` or SSH config alias
- **Domain name** (optional) — if none, self-signed certs will be used
- **Node name** — human-readable label (e.g. `tokyo-01`)

### 1.2 Test SSH

```bash
ssh <server> "echo ok"
```

### 1.3 Probe Server (single SSH round trip)

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
sysctl -n net.core.rmem_max net.core.wmem_max net.ipv4.tcp_congestion_control net.core.default_qdisc 2>/dev/null
PROBE
```

### 1.4 Build Server Profile

| Parameter | Source | Derived Setting |
|-----------|--------|-----------------|
| Memory | `free -b` | QUIC window size — <4 GB → 8 MB; ≥4 GB → 16 MB |
| CPU cores | `nproc` | `maxStreams = cores × 256` (cap 1024) |
| Port conflicts | `ss -tulnp` | Whether to use alternative ports |
| Firewall type | probe | ufw / firewall-cmd / manual |
| Kernel tuning | sysctl | Skip 2.1 if already tuned |
| IPv6 | `ip -6 addr` | Enable dual-stack if present |

### 1.5 Confirm With User

- **Congestion control** — Brutal (dedicated bandwidth, explicit up/down) vs BBR (shared/variable)
- **Bandwidth limits** — if Brutal: confirm up/down Mbps based on server specs
- **Masquerade site** — default `https://www.bing.com/` or custom

---

## Phase 2: Deploy

### 2.1 Kernel Tuning

Skip if probe showed values already tuned.

```bash
ssh <server> bash <<'SYSCTL'
cat > /etc/sysctl.d/99-hysteria.conf << 'EOF'
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
EOF
sysctl -p /etc/sysctl.d/99-hysteria.conf
SYSCTL
```

### 2.2 Install Hysteria2

```bash
ssh <server> "bash <(curl -fsSL https://get.hy2.sh/)"
ssh <server> "hysteria version"
```

### 2.3 Install Diagnostic Tooling

Read [../_shared/DIAG_SETUP.md](../_shared/DIAG_SETUP.md) and run both steps on this server. This enables the `testing-nodes` skill to run without prompting later.

### 2.4 TLS Certificate

**Option A — Domain + inline ACME:**

Hysteria2 handles ACME itself inside `config.yaml` (no separate `hysteria cert` needed). Just prep the directory and confirm port 80 is free for the HTTP-01 challenge:

```bash
ssh <server> bash <<'ACME_PREP'
ss -tlnp | grep ':80 ' && echo "WARNING: port 80 in use — ACME may fail" || echo "port 80 available"
mkdir -p /etc/hysteria
ACME_PREP
```

**Option B — Self-signed EC P-256:**

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

Run `tunpilot node add` with the fields below. The response includes an `auth_callback_url` — **Hysteria2 uses HTTP auth callback** (unlike Trojan/Xray which uses gRPC sync), so capture this URL for the config in 2.6.

```bash
tunpilot node add \
  --name <node-name> \
  --host <server-ip-or-domain> \
  --port 443 \
  --protocol hysteria2 \
  --stats-port 9999 \
  --stats-secret "$(openssl rand -hex 16)" \
  --sni <domain-or-omit> \
  --cert-path /etc/hysteria/cert.pem \
  --ssh-user root --ssh-port 22 \
  --insecure <0-if-acme-or-1-if-selfsigned>
```

Save the returned `auth_callback_url` — format: `http://<tunpilot-ip>:3000/auth/<node-id>/<auth-secret>`.

### 2.6 Write Production Config

Read [hysteria2-template.md](hysteria2-template.md) and pick:

- **Config A (ACME)** — domain + inline `acme` block
- **Config B (Self-signed)** — direct `cert` / `key` paths

Fill placeholders from the Phase 1.4 profile (QUIC windows, maxStreams) and Phase 1.5 choices (CC, bandwidth, masquerade). Write:

```bash
ssh <server> "cat > /etc/hysteria/config.yaml << 'CONF'
<filled config from template>
CONF"
```

### 2.7 Systemd Hardening

Read [../_shared/SYSTEMD_HARDENING.md](../_shared/SYSTEMD_HARDENING.md) and apply with:

- `{{SERVICE}}` = `hysteria-server`
- `{{READ_WRITE_PATHS}}` = `/etc/hysteria`
- `{{CAPABILITIES}}` = `CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW` *(Hysteria2 binds UDP/443 and may need raw sockets for BBR pacing)*

### 2.8 Firewall

Hysteria2 needs UDP/443 (main traffic), TCP/443 (optional masquerade fallback), and TCP/80 (ACME only).

```bash
ssh <server> bash <<'FIREWALL'
if command -v ufw &>/dev/null; then
  ufw allow 443/udp && ufw allow 443/tcp && ufw allow 80/tcp && ufw reload
elif command -v firewall-cmd &>/dev/null; then
  firewall-cmd --permanent --add-port=443/udp
  firewall-cmd --permanent --add-port=443/tcp
  firewall-cmd --permanent --add-port=80/tcp
  firewall-cmd --reload
else
  echo "No firewall manager — ensure UDP/443, TCP/443, TCP/80 are open at provider level"
fi
FIREWALL
```

### 2.9 Start Service

```bash
ssh <server> "systemctl enable --now hysteria-server && sleep 2 && systemctl is-active hysteria-server"
```

If inactive:

```bash
ssh <server> "journalctl -u hysteria-server --no-pager -n 50"
```

---

## Phase 3: Verify

### 3.1 Health Check

```bash
tunpilot health <node-id>
```

### 3.2 Masquerade Test (ACME only)

```bash
curl -I https://<domain>
```

Response should show headers from the masquerade target (e.g. Bing).

### 3.3 Stats API

```bash
ssh <server> "curl -s -H 'Authorization: <stats_secret>' http://127.0.0.1:9999/online"
```

Expect JSON with online user count.

### 3.4 Deployment Summary

Report to user: node name and ID, server IP/domain, protocol and port, TLS type, congestion control and bandwidth, kernel tuning status, health check result, and subscription instructions (`tunpilot user update <user-id> --nodes <node-id>,…` to grant access, then `tunpilot sub create --user <user-id> --format <format>` to issue a link).

---

## Troubleshooting

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| `tunpilot health` shows unreachable | Stats API not accessible | Verify `stats_port` and `stats_secret` match between TunPilot and the node config |
| Service won't start | Config syntax error | `journalctl -u hysteria-server --no-pager -n 50` and validate YAML |
| ACME cert fails | DNS not pointing to server, or port 80 occupied | `dig <domain>`; `ss -tlnp \| grep ':80 '` |
| Clients can't connect | Firewall blocking UDP/443 | `ss -ulnp \| grep 443`; test with `nc -u <ip> 443` |
| Slow speeds | Brutal bandwidth mis-set, or ISP shaping | Confirm Brutal up/down match actual capacity; try BBR |
| Auth callback failures | Node can't reach TunPilot | `curl <auth_callback_url>` from the node |

For generic SSH / systemd issues, see [../_shared/SSH_TROUBLESHOOTING.md](../_shared/SSH_TROUBLESHOOTING.md).

---

## CLI Reference

| Command | Use When |
|---------|----------|
| `tunpilot node list` | See all registered nodes |
| `tunpilot node add …` | Register a new node (Phase 2.5) |
| `tunpilot node update <id> …` | Change node config (port, SNI, enable/disable) |
| `tunpilot node remove <id>` | Delete a node (cascades user assignments) |
| `tunpilot health [<id>]` | Verify node reachability |
| `tunpilot traffic --node <id>` | Query traffic usage |
| `tunpilot user update <id> --nodes <node-id>,…` | Grant a user access to specific nodes |
| `tunpilot sub create --user <id> --format <format>` | Generate a subscription link |
