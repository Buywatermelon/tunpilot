import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "../../db/index";
import { listNodes } from "../../services/node";

const HY2_CONFIG_TEMPLATE = `listen: :443

tls:
  cert: /etc/hysteria/cert.pem
  key: /etc/hysteria/key.pem

auth:
  type: http
  http:
    url: {{AUTH_CALLBACK_URL}}

masquerade:
  type: proxy
  proxy:
    url: https://news.ycombinator.com
    rewriteHost: true

trafficStats:
  listen: :{{STATS_PORT}}
  secret: {{STATS_SECRET}}`;

const SETUP_GUIDE = `# New Node Setup Guide

1. Deploy Hysteria2 on the target VPS:
   - Install: curl -fsSL https://get.hy2.sh/ | bash
   - Create config directory: mkdir -p /etc/hysteria

2. Obtain TLS certificate:
   - Use ACME: hysteria cert --domain your-domain.com
   - Or manual: place cert.pem and key.pem in /etc/hysteria/

3. Get config template:
   - Call get_deploy_template with protocol "hysteria2"
   - Fill in AUTH_CALLBACK_URL, STATS_PORT, STATS_SECRET

4. Register the node in TunPilot:
   - Call add_node with the node details
   - Note the returned auth_callback_url

5. Update Hysteria2 config:
   - Set auth.http.url to the auth_callback_url from step 4
   - Restart: systemctl restart hysteria-server

6. Verify connectivity:
   - Call check_health to confirm the node is reachable`;

export function register(server: McpServer, db: Db, _baseUrl: string) {
  server.tool(
    "get_deploy_template",
    "Get Hysteria2 config template for node deployment",
    {
      protocol: z
        .string()
        .optional()
        .describe('Protocol type (default: "hysteria2")'),
    },
    async ({ protocol }) => {
      const proto = protocol || "hysteria2";
      if (proto !== "hysteria2") {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `Unsupported protocol: ${proto}` }),
            },
          ],
        };
      }
      return {
        content: [
          { type: "text", text: JSON.stringify({ protocol: proto, template: HY2_CONFIG_TEMPLATE }) },
        ],
      };
    }
  );

  server.tool(
    "get_cert_status",
    "Get certificate expiry status for all nodes",
    {},
    async () => {
      const nodes = listNodes(db);
      const certs = nodes.map((node) => ({
        id: node.id,
        name: node.name,
        host: node.host,
        cert_path: node.cert_path,
        cert_expires: node.cert_expires,
        enabled: node.enabled,
      }));
      return { content: [{ type: "text", text: JSON.stringify(certs) }] };
    }
  );

  server.tool(
    "get_setup_guide",
    "Get step-by-step guide for adding a new node",
    {},
    async () => {
      return {
        content: [
          { type: "text", text: JSON.stringify({ guide: SETUP_GUIDE }) },
        ],
      };
    }
  );
}
