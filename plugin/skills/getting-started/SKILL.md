---
name: getting-started
description: Use when the user wants to deploy TunPilot server, configure CLI access, update an existing installation, or set up TunPilot for the first time.
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

- **Already have a running TunPilot server?** → Skip to "Connect CLI"
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
4. Generates auth token and creates `.env`
5. Creates and starts a systemd service
6. Prints connection info — **capture this output**

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

## Step 2: Connect CLI

### Verify server is reachable from local machine

Before connecting, confirm the server responds from the client side (run locally, **not** via SSH):

```bash
curl --max-time 5 http://<ip>:3000/health
```

Expected: `{"status":"ok"}`. If this fails:
- **Connection refused** — firewall on the server is blocking port 3000. Go back to Step 1 firewall check.
- **Timeout** — network path issue. Check if there's a NAT/firewall between your machine and the server. Try `nc -zv <ip> 3000` to test TCP connectivity.
- **Connection reset** — the service crashed. SSH in and check `journalctl -u tunpilot --no-pager -n 30`.

### Configure CLI

Set the server URL and auth token:

```bash
tunpilot config set server http://<ip>:3000
tunpilot config set token <auth-token>
```

The auth token is the `AUTH_TOKEN` value from `/opt/tunpilot/.env` on the server.

### Verify connection

After configuring, verify the CLI can reach the server:

```bash
tunpilot health
```

This should return JSON with node health status.

## Security Notice

The default deployment uses **plain HTTP**. The auth token is transmitted in cleartext. For production use, consider one of these mitigations:

**Option A — SSH tunnel (simplest, no domain needed):**
```bash
# On the local machine, forward local port 3000 to the server
ssh -N -L 3000:localhost:3000 <server>
```
Then configure CLI to `http://localhost:3000` instead. The server can bind to `127.0.0.1` only (change `TUNPILOT_HOST=127.0.0.1` in `.env`).

**Option B — Reverse proxy with TLS (requires domain):**
Use Caddy or nginx in front of TunPilot with a TLS certificate. Update `TUNPILOT_BASE_URL` to the HTTPS URL.

**Option C — Firewall source IP restriction (quick hardening):**
```bash
ssh <server> "ufw default deny incoming && ufw allow from <your-ip> to any port 3000 && ufw allow 22/tcp && ufw enable"
```
Restricts port 3000 to only your IP address.

## What's Next

After connecting, the CLI provides commands across 6 categories:
- **Nodes**: `tunpilot node list`, `tunpilot node add`, `tunpilot node update`, `tunpilot node remove`, `tunpilot node sync`
- **Users**: `tunpilot user list`, `tunpilot user create`, `tunpilot user update`, `tunpilot user delete`, `tunpilot user reset-traffic`
- **Subscriptions**: `tunpilot sub list`, `tunpilot sub create`, `tunpilot sub delete`
- **Monitoring**: `tunpilot health`, `tunpilot traffic`
- **Settings**: `tunpilot setting list`, `tunpilot setting set`

Next step: deploy proxy nodes using the `deploying-hy2-nodes` (Hysteria2) or `deploying-xray-nodes` (Trojan) skill.
