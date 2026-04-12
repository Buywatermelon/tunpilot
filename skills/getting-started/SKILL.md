---
name: getting-started
description: "Deploys TunPilot server via SSH, wires up the local `tunpilot` CLI or web admin, and verifies end-to-end connectivity. Use when installing TunPilot, deploying the server, configuring remote access, updating an existing installation, or setting up TunPilot for the first time."
metadata:
  openclaw:
    requires:
      bins:
        - ssh
    emoji: "🚀"
    homepage: https://github.com/Buywatermelon/tunpilot
---

# TunPilot Getting Started

Guide the user from zero to a working TunPilot setup they can manage from either the web admin or the `tunpilot` CLI.

## Step 0: Detect User State

Ask the user what they need before jumping into deployment:

- **Already have a running TunPilot server?** → Skip to "Configure Client"
- **Already configured but want to update?** → Skip to "Update"
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
3. Installs dependencies and builds the web admin
4. Generates `TUNPILOT_AUTH_TOKEN` and creates `.env`
5. Creates and starts a systemd service
6. Prints the web admin URL, REST endpoint, and auth token — **capture this output**

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

The deploy script is idempotent. It `git pull`s, rebuilds the web admin, and restarts — preserving `.env` and token:
```bash
ssh <server> "curl -fsSL https://raw.githubusercontent.com/Buywatermelon/tunpilot/main/scripts/deploy.sh | bash"
```

## Step 2: Configure Client

### Verify reachability from the user's machine

Before wiring up a client, confirm the server responds from the client side (run locally, **not** via SSH):

```bash
curl --max-time 5 http://<ip>:3000/health
```

Expected: `{"status":"ok"}`. If this fails:
- **Connection refused** — firewall on the server is blocking port 3000. Go back to Step 1 firewall check.
- **Timeout** — network path issue. Check for NAT/firewall between the user and the server. `nc -zv <ip> 3000` tests TCP reachability.
- **Connection reset** — the service crashed. SSH in: `journalctl -u tunpilot --no-pager -n 30`.

### Pick a client

TunPilot exposes three equivalent entry points. Pick whichever fits the user's workflow — or use the CLI (what this skill standardizes on, because Agents operate through it).

#### Option A — Web Admin (zero install)

Open `http://<ip>:3000` in a browser and paste the token on the login screen. Done.

#### Option B — `tunpilot` CLI (what Agents use)

Install the CLI on the **user's local machine** (not the server):

```bash
bun install -g github:Buywatermelon/tunpilot
```

If the user doesn't have Bun locally:
```bash
curl -fsSL https://bun.sh/install | bash
```

Configure the CLI:

```bash
tunpilot config set server http://<ip>:3000
tunpilot config set token <auth-token>
```

Config lives in `~/.config/tunpilot/config.json`.

#### Option C — REST API direct

```bash
curl -H "Authorization: Bearer <token>" http://<ip>:3000/api/v1/nodes
```

Useful for scripting or integration.

### Verify the client works

Run a no-op list command to confirm auth and connectivity:

```bash
tunpilot node list
```

Expected: either a table of nodes, or a "no nodes yet" notice. Any HTTP error (401, 5xx, timeout) means the client config is wrong or the server is unreachable — debug using the checklist above.

## Security Notice

The default deployment uses **plain HTTP**. The auth token is transmitted in cleartext. For production use, consider one of these mitigations:

**Option A — SSH tunnel (simplest, no domain needed):**
```bash
ssh -N -L 3000:localhost:3000 <server>
```
Then point the CLI at `http://localhost:3000` and bind the server to loopback only (`TUNPILOT_HOST=127.0.0.1` in `.env`).

**Option B — Reverse proxy with TLS (requires domain):**
Use Caddy or nginx in front of TunPilot with a TLS certificate. Update `TUNPILOT_BASE_URL` to the HTTPS URL (this also fixes subscription links for clients).

**Option C — Firewall source IP restriction (quick hardening):**
```bash
ssh <server> "ufw default deny incoming && ufw allow from <your-ip> to any port 3000 && ufw allow 22/tcp && ufw enable"
```
Restricts port 3000 to a single source IP.

## What's Next

With the CLI or web admin connected, use the `deploying-hy2-nodes` (Hysteria2) or `deploying-xray-nodes` (Trojan) skill to register your first proxy node. The Agent will drive those flows via `tunpilot node add`, `tunpilot user create`, and friends.
