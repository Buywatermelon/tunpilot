---
name: deploy-server
description: Use when the user wants to deploy or install the TunPilot management server on a VPS/server, or update an existing TunPilot installation.
version: 0.1.0
---

# Deploy TunPilot Server

Guide the user through deploying the TunPilot management server.

## Prerequisites

Ask the user for:
- **Server access**: SSH connection info (e.g. `ssh root@1.2.3.4` or an SSH alias)
- Confirm the server runs Linux with root access

## Deployment

Run the one-command deploy script on the server via SSH:

```bash
ssh <server> "curl -fsSL https://raw.githubusercontent.com/Buywatermelon/tunpilot/main/scripts/deploy.sh | bash"
```

The script automatically:
1. Installs Bun (if not present)
2. Clones the TunPilot repository to `/opt/tunpilot`
3. Installs dependencies
4. Generates MCP auth token
5. Detects public IP and creates `.env`
6. Creates and starts a systemd service
7. Prints the `claude mcp add` command

## After Deployment

1. **Verify** the last line of output shows `✔ TunPilot deployed on http://<ip>:3000`
2. **Connect Claude Code** — run the `claude mcp add` command from the script output
3. **Confirm** by running `/mcp` to check `tunpilot · connected`

If the script outputs an error, check logs with:

```bash
ssh <server> "journalctl -u tunpilot --no-pager -n 50"
```

## Updating

The same script supports updates. Re-running it on a server with an existing installation will `git pull` and restart the service, preserving the existing `.env` and token.
