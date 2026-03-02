---
name: deploying-nodes
description: Use when deploying a new TunPilot proxy node, configuring Hysteria2, setting up TLS certificates, or performing node operations.
---

# TunPilot Node Deployment & Operations

TunPilot manages Hysteria2 proxy nodes. This skill provides deployment guides and configuration templates.

## Available References

When deploying a new node, read `setup-guide.md` for the step-by-step process.

When you need the Hysteria2 server configuration, read `hysteria2-template.md` for the config template with placeholders.

## Key MCP Tools

After deploying, use these MCP tools to register and verify:
- `add_node` — Register the node in TunPilot (returns auth_callback_url)
- `check_health` — Verify node connectivity
- `get_cert_status` — Check TLS certificate expiry
