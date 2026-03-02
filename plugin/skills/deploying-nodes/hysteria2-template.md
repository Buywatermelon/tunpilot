# Hysteria2 Configuration Template

Replace the `{{PLACEHOLDER}}` values before deploying.

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

trafficStats:
  listen: :{{STATS_PORT}}
  secret: {{STATS_SECRET}}
```

## Placeholders

| Placeholder | Description | Example |
|---|---|---|
| `{{AUTH_CALLBACK_URL}}` | TunPilot auth callback URL (returned by `add_node`) | `https://tunpilot.example.com/auth/callback/node-id?secret=xxx` |
| `{{STATS_PORT}}` | Port for traffic stats API | `9999` |
| `{{STATS_SECRET}}` | Secret for traffic stats API | A random string |
