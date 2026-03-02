---
name: setup-tunpilot
description: Use when the user wants to configure, connect, or set up TunPilot MCP connection in Claude Code.
version: 0.1.0
---

# TunPilot MCP Setup

Help the user configure the TunPilot MCP connection in Claude Code.

## Steps

1. **Ask for connection info** — Prompt the user for:
   - TunPilot server URL (e.g. `http://95.181.188.250:3000`)
   - MCP auth token

2. **Add the MCP server** — Run the following command (replace placeholders with actual values):

   ```bash
   claude mcp add --transport http \
     --header "Authorization: Bearer <token>" \
     --scope user \
     tunpilot <url>/mcp
   ```

3. **Verify connection** — Tell the user to run `/mcp` in Claude Code to confirm `tunpilot · connected`.

4. **(Optional) Persist env vars** — If the user also wants the plugin's `.mcp.json` to work, suggest adding to `~/.zshrc`:

   ```bash
   export TUNPILOT_URL=<url>
   export TUNPILOT_MCP_TOKEN=<token>
   ```

## Notes

- The `--scope user` flag stores config in `~/.claude.json`, available across all projects.
- If the user already has a TunPilot MCP server configured, ask if they want to replace it (`claude mcp remove tunpilot` first).
