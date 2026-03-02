# New Node Setup Guide

1. Deploy Hysteria2 on the target VPS:
   - Install: curl -fsSL https://get.hy2.sh/ | bash
   - Create config directory: mkdir -p /etc/hysteria

2. Obtain TLS certificate:
   - Use ACME: hysteria cert --domain your-domain.com
   - Or manual: place cert.pem and key.pem in /etc/hysteria/

3. Get config template:
   - Read `hysteria2-template.md` in this skill directory
   - Fill in AUTH_CALLBACK_URL, STATS_PORT, STATS_SECRET

4. Register the node in TunPilot:
   - Call `add_node` MCP tool with the node details
   - Note the returned auth_callback_url

5. Update Hysteria2 config:
   - Set auth.http.url to the auth_callback_url from step 4
   - Restart: systemctl restart hysteria-server

6. Verify connectivity:
   - Call `check_health` MCP tool to confirm the node is reachable
