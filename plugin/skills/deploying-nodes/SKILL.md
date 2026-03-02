---
name: deploying-nodes
description: Use when deploying a new Hysteria2 proxy node, configuring TLS certificates, registering nodes in TunPilot, or performing node operations.
version: 0.2.0
metadata:
  openclaw:
    requires:
      bins:
        - ssh
    emoji: "🛰️"
    homepage: https://github.com/Buywatermelon/tunpilot
---

# TunPilot Node Deployment

Deploy a Hysteria2 proxy node and register it with TunPilot. This is an end-to-end runbook — follow each step in order.

**Prerequisite**: TunPilot server must be running and MCP must be connected (use `getting-started` skill if not).

## Step 1: Gather Information

Ask the user for:
- **Target server**: SSH destination for the new node (e.g. `root@node1.example.com`)
- **Domain name**: A domain pointing to this server's IP (required for TLS). If no domain, will use self-signed certs.
- **Node name**: A human-readable label (e.g. `tokyo-01`, `bwg-us`)

Test SSH:
```bash
ssh <server> "echo ok"
```

## Step 2: Install Hysteria2

```bash
ssh <server> "curl -fsSL https://get.hy2.sh/ | bash"
```

Verify:
```bash
ssh <server> "hysteria version"
```

## Step 3: TLS Certificate

**Option A — ACME (recommended, requires domain):**
```bash
ssh <server> "mkdir -p /etc/hysteria && hysteria cert -d <domain> -o /etc/hysteria/cert.pem -k /etc/hysteria/key.pem"
```

**Option B — Self-signed (no domain):**
```bash
ssh <server> "mkdir -p /etc/hysteria && openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -keyout /etc/hysteria/key.pem -out /etc/hysteria/cert.pem -days 3650 -nodes -subj '/CN=bing.com'"
```

## Step 4: Register Node in TunPilot

Use the `add_node` MCP tool. This returns the `auth_callback_url` needed for Hysteria2 config.

Required parameters:
- `name`: the node name from Step 1
- `host`: the server's IP or domain
- `port`: `443` (Hysteria2 default)
- `protocol`: `hysteria2`

Recommended optional parameters:
- `stats_port`: `9999` (for traffic sync)
- `stats_secret`: generate a random string
- `sni`: the domain name (if using ACME)
- `cert_path`: `/etc/hysteria/cert.pem`
- `ssh_user`: `root`
- `ssh_port`: `22`

**Save the returned `auth_callback_url`** — it looks like `http://<tunpilot-ip>:3000/auth/<node-id>/<auth-secret>`.

## Step 5: Configure Hysteria2

Read the config template from `hysteria2-template.md` in this skill directory.

Fill in the placeholders and write the config:

```bash
ssh <server> "cat > /etc/hysteria/config.yaml << 'CONF'
listen: :443

tls:
  cert: /etc/hysteria/cert.pem
  key: /etc/hysteria/key.pem

auth:
  type: http
  http:
    url: <AUTH_CALLBACK_URL from Step 4>

masquerade:
  type: proxy
  proxy:
    url: https://news.ycombinator.com
    rewriteHost: true

bandwidth:
  up: 1 gbps
  down: 1 gbps

trafficStats:
  listen: :<STATS_PORT>
  secret: <STATS_SECRET>
CONF"
```

Adjust `bandwidth` based on the server's actual network capacity.

## Step 6: Open Firewall Ports

```bash
ssh <server> "command -v ufw && ufw allow 443/udp && ufw allow 443/tcp || command -v firewall-cmd && firewall-cmd --add-port=443/udp --add-port=443/tcp --permanent && firewall-cmd --reload || echo 'no firewall detected'"
```

Hysteria2 uses UDP on port 443. The TCP rule is for the TLS handshake fallback.

## Step 7: Start Service

```bash
ssh <server> "systemctl enable hysteria-server && systemctl restart hysteria-server && sleep 2 && systemctl is-active hysteria-server"
```

If it fails, check logs:
```bash
ssh <server> "journalctl -u hysteria-server --no-pager -n 30"
```

Common issues:
- **Port 443 in use** — stop any existing web server or change the Hysteria2 listen port.
- **Certificate error** — verify cert files exist and are readable.
- **Auth callback unreachable** — ensure the TunPilot server is reachable from the node (check firewall on both sides).

## Step 8: Verify

Use the `check_health` MCP tool to confirm the node is registered and active.

Use `get_node_info` with the node ID to review the full configuration.

## MCP Tools Reference

| Tool | Use When |
|------|----------|
| `list_nodes` | See all registered nodes |
| `get_node_info` | Inspect a specific node's details |
| `add_node` | Register a new node (Step 4) |
| `update_node` | Change node config (port, SNI, enable/disable) |
| `remove_node` | Delete a node (cascades user assignments) |
| `check_health` | Verify all nodes are reachable |
| `get_cert_status` | Check TLS certificate expiry dates |
| `get_traffic_stats` | Query traffic usage by node or user |
