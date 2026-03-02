---
name: getting-started
description: Use when the user wants to deploy TunPilot server, connect MCP to Claude Code or OpenClaw, update an existing installation, or set up TunPilot for the first time.
version: 0.1.0
metadata:
  openclaw:
    requires:
      bins:
        - ssh
    emoji: "🚀"
    homepage: https://github.com/Buywatermelon/tunpilot
---

# TunPilot Getting Started

Guide the user from zero to a fully connected TunPilot setup. Two phases: deploy the server, then connect the agent.

## Phase 1: Deploy Server

### Prerequisites

Ask the user for:
- **Server access**: SSH connection info (e.g. `ssh root@1.2.3.4` or an SSH alias)
- Confirm the server runs Linux with root access

### Deploy

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
7. **Prints the `claude mcp add` command** — capture this for Phase 2

### Verify

Confirm the output shows `✔ TunPilot deployed on http://<ip>:3000`.

If there's an error, check logs:

```bash
ssh <server> "journalctl -u tunpilot --no-pager -n 50"
```

### Updating

The same script supports re-runs. It will `git pull` and restart the service, preserving the existing `.env` and token.

## Phase 2: Connect MCP

### Option A: From deploy output (recommended)

The deploy script outputs a complete `claude mcp add` command. Run it directly:

```bash
claude mcp add --transport http \
  --header "Authorization: Bearer <token>" \
  --scope user \
  tunpilot http://<ip>:3000/mcp
```

### Option B: Manual connection

If the user already has a running TunPilot server and needs to connect, ask for:
- TunPilot server URL (e.g. `http://1.2.3.4:3000`)
- MCP auth token

Then run the same `claude mcp add` command with their values.

### Verify

Tell the user to run `/mcp` in Claude Code and confirm `tunpilot · connected`.

## Notes

- `--scope user` stores config in `~/.claude.json`, available across all projects.
- If a `tunpilot` MCP server already exists, remove it first: `claude mcp remove tunpilot`
- After connecting, the user has access to 16 MCP tools for node, user, subscription, and monitoring management.
- Next step: deploy Hysteria2 proxy nodes using the `deploying-nodes` skill.
