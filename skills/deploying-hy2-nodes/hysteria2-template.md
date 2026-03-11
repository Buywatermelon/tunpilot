# Hysteria2 Configuration Template

Production-grade Hysteria2 server configuration. Two variants are provided — choose based on whether you have a domain pointing to the server.

---

## Config A — With Domain (ACME Auto-TLS)

Use this when a domain name points to the server's IP. ACME handles certificate issuance and renewal automatically.

```yaml
listen: :443

acme:
  domains:
    - {{DOMAIN}}
  email: admin@{{DOMAIN}}
  dir: /etc/hysteria/acme

quic:
  initStreamReceiveWindow: {{STREAM_WINDOW}}
  maxStreamReceiveWindow: {{STREAM_WINDOW}}
  initConnReceiveWindow: {{CONN_WINDOW}}
  maxConnReceiveWindow: {{CONN_WINDOW}}
  maxIdleTimeout: 30s
  maxIncomingStreams: {{MAX_STREAMS}}
  disablePathMTUDiscovery: false

# bandwidth:
#   up: {{BANDWIDTH_UP}}
#   down: {{BANDWIDTH_DOWN}}

auth:
  type: http
  http:
    url: {{AUTH_CALLBACK_URL}}

resolver:
  type: https
  https:
    addr: 1.1.1.1:443
    sni: cloudflare-dns.com
    timeout: 10s

masquerade:
  type: proxy
  proxy:
    url: https://www.bing.com/
    rewriteHost: true
  listenHTTPS: :443
  forceHTTPS: true

trafficStats:
  listen: 127.0.0.1:{{STATS_PORT}}
  secret: {{STATS_SECRET}}
```

---

## Config B — Without Domain (Self-signed Certificate)

Use this when no domain is available. Requires a self-signed certificate generated beforehand. Clients must set `insecure: true` or pin the certificate.

```yaml
listen: :443

tls:
  cert: /etc/hysteria/cert.pem
  key: /etc/hysteria/key.pem
  sniGuard: disable

quic:
  initStreamReceiveWindow: {{STREAM_WINDOW}}
  maxStreamReceiveWindow: {{STREAM_WINDOW}}
  initConnReceiveWindow: {{CONN_WINDOW}}
  maxConnReceiveWindow: {{CONN_WINDOW}}
  maxIdleTimeout: 30s
  maxIncomingStreams: {{MAX_STREAMS}}
  disablePathMTUDiscovery: false

# bandwidth:
#   up: {{BANDWIDTH_UP}}
#   down: {{BANDWIDTH_DOWN}}

auth:
  type: http
  http:
    url: {{AUTH_CALLBACK_URL}}

resolver:
  type: https
  https:
    addr: 1.1.1.1:443
    sni: cloudflare-dns.com
    timeout: 10s

masquerade:
  type: proxy
  proxy:
    url: https://www.bing.com/
    rewriteHost: true

trafficStats:
  listen: 127.0.0.1:{{STATS_PORT}}
  secret: {{STATS_SECRET}}
```

---

## Placeholders

| Placeholder | Description | How to determine |
|---|---|---|
| `{{DOMAIN}}` | Domain pointing to this server | User input |
| `{{STREAM_WINDOW}}` | QUIC stream receive window (bytes) | Memory < 4 GB: `8388608` (8 MB). Memory >= 4 GB: `16777216` (16 MB) |
| `{{CONN_WINDOW}}` | QUIC connection receive window (bytes) | Memory < 4 GB: `20971520` (20 MB). Memory >= 4 GB: `41943040` (40 MB). Must be 2.5x stream window |
| `{{MAX_STREAMS}}` | Max concurrent QUIC streams | `min(1024, CPU_CORES * 256)` |
| `{{AUTH_CALLBACK_URL}}` | TunPilot auth callback URL | Returned by the `add_node` MCP tool |
| `{{STATS_PORT}}` | Traffic stats API port | Default: `9999` |
| `{{STATS_SECRET}}` | Traffic stats API secret | Random hex string, e.g. `openssl rand -hex 16` |
| `{{BANDWIDTH_UP}}` | Server upload limit (Brutal mode only) | User-provided, e.g. `200 mbps` |
| `{{BANDWIDTH_DOWN}}` | Server download limit (Brutal mode only) | User-provided, e.g. `100 mbps` |

---

## Decision Reference

### BBR vs Brutal

The `bandwidth` section is **commented out by default**. When omitted on the server side, the behavior depends on the client configuration:

- If the **client also omits** bandwidth, Hysteria2 falls back to the kernel's **BBR** congestion control.
- If the **client specifies** bandwidth, Hysteria2 uses **Brutal** with the client-provided values.

This means omitting `bandwidth` on the server does not guarantee BBR — it delegates the decision to the client.

- **BBR**: TCP-friendly congestion control. Works well on stable networks and does not require knowing the server's bandwidth cap. Recommended unless you have a specific reason to switch.
- **Brutal**: Hysteria2's custom congestion control. Ignores packet loss signals and sends at the configured rate regardless. Useful when the path has bufferbloat or artificial throttling, but **wastes bandwidth if the values are set higher than actual capacity**. Uncomment the `bandwidth` block and fill in real values only if BBR underperforms.

### QUIC Window 2.5x Ratio

The connection receive window (`{{CONN_WINDOW}}`) should be **at least 2.5 times** the stream receive window (`{{STREAM_WINDOW}}`). This is a Hysteria2-specific recommendation matching its defaults of 8 MB / 20 MB. The connection window must be larger than any single stream's window because it governs the aggregate flow across all multiplexed streams. The recommended values in the placeholder table already satisfy this ratio.

### Stats API Security

`trafficStats.listen` is bound to `127.0.0.1` (loopback only), **not** `0.0.0.0`. This means only processes on the same machine can reach the stats API. TunPilot's traffic sync connects via SSH tunnel or runs co-located, so external exposure is unnecessary. Binding to `0.0.0.0` would expose user traffic data to the public internet even with a secret, since the secret is transmitted via the `Authorization` header over unencrypted HTTP.

### Masquerade: Config A vs Config B

Both configs use `type: proxy` with `https://www.bing.com/` as the masquerade target. The difference is in the TCP layer:

- **Config A** includes `listenHTTPS` and `forceHTTPS` in the masquerade block. Because ACME provides a valid certificate, the server can serve a convincing HTTPS website on TCP port 443 to any browser or probe. Note: `listenHTTP: :80` is intentionally omitted to avoid a port conflict with ACME's HTTP-01 challenge listener, which also needs port 80. If you need HTTP→HTTPS redirect, use a separate reverse proxy or switch ACME to `type: tls` or `type: dns`.
- **Config B** omits these TCP masquerade options. A self-signed certificate would trigger browser warnings, which defeats the purpose of masquerading. The proxy masquerade still works for QUIC-level probes (the Hysteria2 protocol layer), but TCP visitors will get a connection refused instead of a fake website.
