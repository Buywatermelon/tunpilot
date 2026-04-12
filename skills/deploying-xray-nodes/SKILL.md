---
name: deploying-xray-nodes
description: "Deploys TCP Trojan proxy nodes on Xray-core with certbot Let's Encrypt or self-signed EC P-256 + SHA-256 certificate fingerprint pinning, TCP Fast Open kernel tuning with BBR, nginx-compatible fallback site, gRPC user sync (not HTTP auth callback), and systemd hardening with strict filesystem isolation. Use when deploying a Trojan node on Xray, pinning a self-signed cert fingerprint, configuring TCP Fast Open, or setting up the Xray gRPC stats API. Not for Hysteria2 — see deploying-hy2-nodes."
metadata:
  openclaw:
    requires:
      bins:
        - ssh
    emoji: "🛰️"
    homepage: https://github.com/Buywatermelon/tunpilot
---

# TunPilot Xray-core Trojan Node Deployment

Deploy a production-grade Xray-core Trojan proxy node with automatic performance tuning, security hardening, and certificate fingerprint pinning.

**Prerequisite:** TunPilot server running and `tunpilot` CLI configured (use `getting-started` skill if not). All TunPilot operations below go through the CLI.

**Auxiliary files (read when referenced below):**

- [xray-template.md](xray-template.md) — config templates (ACME / self-signed variants)
- [../_shared/DIAG_SETUP.md](../_shared/DIAG_SETUP.md) — diagnostic tooling install
- [../_shared/SYSTEMD_HARDENING.md](../_shared/SYSTEMD_HARDENING.md) — hardening drop-in template
- [../_shared/SSH_TROUBLESHOOTING.md](../_shared/SSH_TROUBLESHOOTING.md) — generic SSH/systemd issues

---

## Phase 1: Gather Information & Probe Server

### 1.1 Ask the User

- **SSH destination** — e.g. `root@node1.example.com` or SSH config alias
- **Domain name** (optional) — if none, self-signed + fingerprint pinning will be used
- **Node name** — human-readable label (e.g. `tokyo-trojan`)

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
echo "=== EXISTING XRAY ==="
xray version 2>/dev/null || echo "not installed"
echo "=== NETWORK ==="
ip -4 addr show scope global 2>/dev/null
ip -6 addr show scope global 2>/dev/null
echo "=== SYSCTL ==="
sysctl -n net.core.rmem_max net.core.wmem_max net.core.somaxconn \
  net.ipv4.tcp_congestion_control net.core.default_qdisc net.ipv4.tcp_fastopen 2>/dev/null
echo "=== DISK ==="
df -h / 2>/dev/null
PROBE
```

### 1.4 Build Server Profile

| Parameter | Source | Derived Setting |
|-----------|--------|-----------------|
| Memory | `free -b` | TCP buffer sizes (rmem/wmem) |
| CPU cores | `nproc` | Connection capacity |
| Port conflicts | `ss -tulnp` | Whether TCP/443 and TCP/80 are available |
| Firewall type | probe | ufw / firewall-cmd / manual |
| Kernel tuning | sysctl | Skip 2.1 if BBR + somaxconn + TFO already set |
| Existing Xray | version check | Fresh install vs upgrade |

### 1.5 Confirm With User

- **TLS strategy** — ACME (requires domain) vs self-signed + SHA-256 fingerprint pinning
- **Fallback site** — what to serve on port 80 for non-Trojan traffic (default: skip; nginx can be added later)
- **gRPC API port** — default `10085`

---

## Phase 2: Deploy

### 2.1 Kernel Tuning

Skip if probe showed values already tuned.

```bash
ssh <server> bash <<'SYSCTL'
cat > /etc/sysctl.d/99-xray.conf << 'EOF'
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.core.somaxconn = 4096
net.ipv4.tcp_fastopen = 3
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
EOF
sysctl -p /etc/sysctl.d/99-xray.conf
SYSCTL
```

### 2.2 Install Xray-core

```bash
ssh <server> 'apt-get update -qq && apt-get install -y -qq unzip curl && bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install'
ssh <server> "xray version"
```

### 2.3 Install Diagnostic Tooling

Read [../_shared/DIAG_SETUP.md](../_shared/DIAG_SETUP.md) and run both steps on this server.

### 2.4 TLS Certificate

**Config A — Domain + certbot standalone:**

Keep cert management separate from Xray via certbot. Auto-reload Xray on renewal via a post-hook:

```bash
ssh <server> bash <<'ACME'
command -v certbot &>/dev/null || apt-get install -y certbot
ss -tlnp | grep ':80 ' && echo "WARNING: port 80 in use — stop it first" || echo "port 80 available"

certbot certonly --standalone -d {{DOMAIN}} --non-interactive --agree-tos --email admin@{{DOMAIN}}

mkdir -p /etc/xray
ln -sf /etc/letsencrypt/live/{{DOMAIN}}/fullchain.pem /etc/xray/cert.pem
ln -sf /etc/letsencrypt/live/{{DOMAIN}}/privkey.pem  /etc/xray/key.pem

cat > /etc/letsencrypt/renewal-hooks/post/restart-xray.sh << 'HOOK'
#!/bin/bash
systemctl restart xray
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/post/restart-xray.sh
ACME
```

**Config B — Self-signed EC P-256 + SHA-256 fingerprint pinning:**

```bash
ssh <server> bash <<'SELFSIGN'
mkdir -p /etc/xray
openssl req -x509 -newkey ec \
  -pkeyopt ec_paramgen_curve:prime256v1 \
  -keyout /etc/xray/key.pem \
  -out /etc/xray/cert.pem \
  -days 3650 -nodes \
  -subj '/CN=bing.com'

echo "=== Certificate SHA-256 Fingerprint ==="
openssl x509 -in /etc/xray/cert.pem -noout -fingerprint -sha256 | sed 's/://g' | cut -d= -f2
SELFSIGN
```

**Save the fingerprint** — used in `add_node` (2.5) and embedded in subscription configs so clients can verify the cert despite self-signed status.

### 2.5 Register Node in TunPilot

Run `tunpilot node add`. Note: **Trojan/Xray uses gRPC sync** rather than HTTP auth callback, so the returned `auth_callback_url` is not consumed by the client.

```bash
tunpilot node add \
  --name <node-name> \
  --host <server-ip-or-domain> \
  --port 443 \
  --protocol trojan \
  --stats-port 10085 \
  --sni <domain-or-omit> \
  --cert-path /etc/xray/cert.pem \
  --ssh-user root --ssh-port 22 \
  --insecure <0-if-acme-or-1-if-selfsigned> \
  --cert-fingerprint <hex-sha256-without-colons>  # Config B only
```

### 2.6 Write Xray Config

Read [xray-template.md](xray-template.md) and pick:

- **Config A (ACME)** — cert paths point to Let's Encrypt symlinks
- **Config B (Self-signed)** — cert paths point to `/etc/xray/*.pem` directly

Fill placeholders, then:

```bash
ssh <server> "cat > /usr/local/etc/xray/config.json << 'CONF'
<filled config from template>
CONF"
```

### 2.7 Systemd Hardening

Read [../_shared/SYSTEMD_HARDENING.md](../_shared/SYSTEMD_HARDENING.md) and apply with:

- `{{SERVICE}}` = `xray`
- `{{READ_WRITE_PATHS}}` = `/usr/local/etc/xray /etc/xray /var/log/xray`
- `{{CAPABILITIES}}` — omit both `AmbientCapabilities` and `CapabilityBoundingSet` lines; Xray runs as root and does not need them.

### 2.8 Firewall

Trojan is TCP-only (unlike Hysteria2 which is UDP):

```bash
ssh <server> bash <<'FIREWALL'
if command -v ufw &>/dev/null; then
  ufw allow 443/tcp && ufw allow 80/tcp && ufw reload
elif command -v firewall-cmd &>/dev/null; then
  firewall-cmd --permanent --add-port=443/tcp
  firewall-cmd --permanent --add-port=80/tcp
  firewall-cmd --reload
else
  echo "No firewall manager — ensure TCP/443 and TCP/80 are open at provider level"
fi
FIREWALL
```

### 2.9 Start Service & Sync Users

```bash
ssh <server> "systemctl enable --now xray && sleep 2 && systemctl is-active xray"
```

If inactive:

```bash
ssh <server> "journalctl -u xray --no-pager -n 50"
```

Once running, run `tunpilot node sync` to push all assigned users to the node via gRPC. Unlike Hysteria2, Xray needs an explicit sync because it does not authenticate via HTTP callback.

---

## Phase 3: Verify

### 3.1 Health Check

```bash
tunpilot health <node-id>
```

### 3.2 gRPC API

```bash
ssh <server> "xray api statsquery --server=127.0.0.1:10085"
```

Returns stats (possibly empty if no traffic yet). If the command errors, verify the `api` block in the Xray config and that `10085` is listening.

### 3.3 Deployment Summary

Report to user: node name and ID, server IP/domain, protocol (Trojan) and port, TLS type, certificate fingerprint (if self-signed), gRPC API port, kernel tuning status, health check result, and subscription instructions (`tunpilot user update <user-id> --nodes <node-id>,…` to grant access, then `tunpilot node sync` to push users).

---

## Troubleshooting

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| `tunpilot health` shows unreachable | gRPC API not accessible | Verify `stats_port` matches Xray `api.listen`; check SSH connectivity |
| Service won't start | Config syntax error | `xray run -test -c /usr/local/etc/xray/config.json` validates JSON; then `journalctl -u xray --no-pager -n 50` |
| ACME cert fails | DNS misconfig or port 80 occupied | `dig <domain>`; `ss -tlnp \| grep ':80 '` |
| Clients can't connect | Firewall blocking TCP/443 | `ss -tlnp \| grep 443`; test with `nc -z <ip> 443` |
| gRPC sync fails | Xray API not listening | Verify `api` block; `ss -tlnp \| grep 10085` |
| Users authenticate but get no quota | Users not synced after assign | Run `tunpilot node sync` |
| Certificate pinning errors | Fingerprint mismatch | Re-extract: `openssl x509 -in /etc/xray/cert.pem -noout -fingerprint -sha256` and update via `tunpilot node update <id> --cert-fingerprint <hex>` |

For generic SSH / systemd issues, see [../_shared/SSH_TROUBLESHOOTING.md](../_shared/SSH_TROUBLESHOOTING.md).

---

## CLI Reference

| Command | Use When |
|---------|----------|
| `tunpilot node list` | See all registered nodes |
| `tunpilot node add --protocol trojan …` | Register a new node (Phase 2.5) |
| `tunpilot node update <id> …` | Change node config (port, SNI, fingerprint, enable/disable) |
| `tunpilot node remove <id>` | Delete a node (cascades user assignments) |
| `tunpilot health [<id>]` | Verify node reachability |
| `tunpilot node sync` | Push users to Trojan nodes via gRPC (Phase 2.9) |
| `tunpilot traffic --node <id>` | Query traffic usage |
| `tunpilot user update <id> --nodes <node-id>,…` | Grant a user access to specific nodes |
| `tunpilot sub create --user <id> --format <format>` | Generate a subscription link |
