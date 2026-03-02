# Hysteria2 Configuration Template

Replace `{{PLACEHOLDER}}` values before deploying.

```yaml
listen: :443

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

bandwidth:
  up: {{BANDWIDTH_UP}}
  down: {{BANDWIDTH_DOWN}}

trafficStats:
  listen: :{{STATS_PORT}}
  secret: {{STATS_SECRET}}
```

## Placeholders

| Placeholder | Description | Example |
|---|---|---|
| `{{AUTH_CALLBACK_URL}}` | TunPilot auth callback URL (returned by `add_node` MCP tool) | `http://1.2.3.4:3000/auth/<node-id>/<auth-secret>` |
| `{{BANDWIDTH_UP}}` | Server upload bandwidth limit | `1 gbps` |
| `{{BANDWIDTH_DOWN}}` | Server download bandwidth limit | `1 gbps` |
| `{{STATS_PORT}}` | Port for traffic stats API | `9999` |
| `{{STATS_SECRET}}` | Secret for traffic stats API (random string) | `a1b2c3d4e5f6` |

## Notes

- `bandwidth` should match the actual server capacity. Overestimating wastes bandwidth; underestimating limits speed.
- `masquerade` makes the server look like a normal HTTPS website when probed. Change the URL if desired.
- `trafficStats` is needed for TunPilot to sync traffic data. The port/secret must match the `stats_port`/`stats_secret` values passed to `add_node`.
