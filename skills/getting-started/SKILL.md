---
name: getting-started
description: Use when the user wants to deploy TunPilot server, connect MCP to Claude Code, update an existing installation, or set up TunPilot for the first time.
version: 0.3.0
metadata:
  openclaw:
    requires:
      bins:
        - ssh
    emoji: "🚀"
    homepage: https://github.com/Buywatermelon/tunpilot
---

# TunPilot Getting Started

Guide the user from zero to a fully connected TunPilot setup.

## Step 0: Detect User State

Ask the user what they need before jumping into deployment:

- **Already have a running TunPilot server?** → Skip to "Connect MCP"
- **Already connected but want to update?** → Skip to "Update"
- **Starting from scratch?** → Continue to "Deploy Server"

## Step 1: Deploy Server

### Prerequisites

1. **Ask the user for the target server** — SSH destination (e.g. `root@1.2.3.4` or an alias from `~/.ssh/config`). Must be Linux with root access.

2. **Test SSH connectivity** — the agent cannot enter passwords interactively:
   ```bash
   ssh <server> "echo ok"
   ```
   If this fails, stop and tell the user to set up SSH key-based login first.

3. **Check firewall** — ensure port 3000 is open:
   ```bash
   ssh <server> "command -v ufw && ufw allow 3000/tcp || command -v firewall-cmd && firewall-cmd --add-port=3000/tcp --permanent && firewall-cmd --reload || echo 'no firewall detected'"
   ```

### Deploy

Run the one-command deploy script:

```bash
ssh <server> "curl -fsSL https://raw.githubusercontent.com/Buywatermelon/tunpilot/main/scripts/deploy.sh | bash"
```

The script automatically:
1. Installs Bun (if not present)
2. Clones/updates the repo to `/opt/tunpilot`
3. Installs dependencies
4. Generates `MCP_AUTH_TOKEN` and creates `.env`
5. Creates and starts a systemd service
6. Prints the `claude mcp add` command — **capture this output**

### Verify deployment

Parse the script output. It should contain `✔ TunPilot deployed on http://<ip>:3000`.

If it fails, diagnose:
```bash
ssh <server> "journalctl -u tunpilot --no-pager -n 50"
```

Common failures:
- **Port 3000 in use** — another service occupies the port. Change `TUNPILOT_PORT` in `/opt/tunpilot/.env` and restart.
- **Bun install failed** — check network connectivity and disk space.
- **Permission denied** — must run as root.

### Update an existing installation

The same deploy script is idempotent. It `git pull`s and restarts, preserving `.env` and token:
```bash
ssh <server> "curl -fsSL https://raw.githubusercontent.com/Buywatermelon/tunpilot/main/scripts/deploy.sh | bash"
```

## Step 2: Connect MCP

### Verify server is reachable from local machine

Before connecting MCP, confirm the server responds from the client side (run locally, **not** via SSH):

```bash
curl --max-time 5 http://<ip>:3000/health
```

Expected: `{"status":"ok"}`. If this fails:
- **Connection refused** — firewall on the server is blocking port 3000. Go back to Step 1 firewall check.
- **Timeout** — network path issue. Check if there's a NAT/firewall between your machine and the server. Try `nc -zv <ip> 3000` to test TCP connectivity.
- **Connection reset** — the service crashed. SSH in and check `journalctl -u tunpilot --no-pager -n 30`.

### Add MCP server

The deploy script prints a ready-to-paste command. Run it locally:

```bash
claude mcp add --transport http \
  --header "Authorization: Bearer <token>" \
  --scope user \
  tunpilot http://<ip>:3000/mcp
```

If a `tunpilot` MCP entry already exists, remove it first:
```bash
claude mcp remove tunpilot
```

#### Manual connection

If the user already has a server (not just deployed), ask for:
- Server URL (e.g. `http://1.2.3.4:3000`)
- MCP auth token (the `MCP_AUTH_TOKEN` value from `/opt/tunpilot/.env`)

Then run the `claude mcp add` command with their values.

### Restart Claude Code

**CRITICAL**: After `claude mcp add`, Claude Code must be restarted to load the new MCP server. Tell the user:

> MCP server added. Please restart Claude Code (exit and reopen) for the connection to take effect.

The agent **cannot** restart Claude Code programmatically — the user must do it manually.

### Verify connection

After restart, verify the MCP server is connected:

```bash
claude mcp list
```

If `claude mcp list` returns empty or doesn't show `tunpilot`, fall back to checking the config file directly:
```bash
cat ~/.claude.json | grep -A 5 tunpilot
```

If the config entry exists but MCP still fails to connect, the issue is runtime connectivity. Re-run the local health check from above.

`--scope user` stores config in `~/.claude.json`, available across all projects.

## Security Notice

The default deployment uses **plain HTTP**. The MCP auth token is transmitted in cleartext. For production use, consider one of these mitigations:

**Option A — SSH tunnel (simplest, no domain needed):**
```bash
# On the local machine, forward local port 3000 to the server
ssh -N -L 3000:localhost:3000 <server>
```
Then connect MCP to `http://localhost:3000/mcp` instead. The server can bind to `127.0.0.1` only (change `TUNPILOT_HOST=127.0.0.1` in `.env`).

**Option B — Reverse proxy with TLS (requires domain):**
Use Caddy or nginx in front of TunPilot with a TLS certificate. Update `TUNPILOT_BASE_URL` to the HTTPS URL.

**Option C — Firewall source IP restriction (quick hardening):**
```bash
ssh <server> "ufw default deny incoming && ufw allow from <your-ip> to any port 3000 && ufw allow 22/tcp && ufw enable"
```
Restricts port 3000 to only your IP address.

## What's Next

After connecting, the user has 16 MCP tools across 4 categories:
- **Nodes** (5): list_nodes, get_node_info, add_node, update_node, remove_node
- **Users** (5): list_users, create_user, update_user, delete_user, reset_traffic
- **Subscriptions** (3): generate_subscription, list_subscriptions, get_subscription_config
- **Monitoring** (3): check_health, get_traffic_stats, get_cert_status

Next step: deploy Hysteria2 proxy nodes using the `deploying-nodes` skill.
