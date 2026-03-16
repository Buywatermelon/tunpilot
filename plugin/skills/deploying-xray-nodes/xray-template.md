# Xray-core Configuration Template

Production-grade Xray-core Trojan server configuration. Two variants are provided — choose based on whether you have a domain pointing to the server.

---

## Config A — With Domain (ACME Certificate)

Use this when a domain name points to the server's IP. Certificates are managed externally by certbot/acme.sh.

> **Note**: The `api.listen` field makes Xray's built-in API listen directly — do NOT add a separate `dokodemo-door` inbound for the API port, or you'll get a "bind: address already in use" error.

```json
{
  "log": {
    "loglevel": "warning",
    "access": "/var/log/xray/access.log",
    "error": "/var/log/xray/error.log"
  },
  "stats": {},
  "api": {
    "tag": "api",
    "listen": "127.0.0.1:{{API_PORT}}",
    "services": [
      "HandlerService",
      "StatsService"
    ]
  },
  "policy": {
    "levels": {
      "0": {
        "statsUserUplink": true,
        "statsUserDownlink": true
      }
    },
    "system": {
      "statsInboundUplink": true,
      "statsInboundDownlink": true,
      "statsOutboundUplink": true,
      "statsOutboundDownlink": true
    }
  },
  "inbounds": [
    {
      "tag": "trojan-in",
      "port": 443,
      "protocol": "trojan",
      "settings": {
        "clients": [],
        "fallbacks": [
          {
            "dest": 80
          }
        ]
      },
      "streamSettings": {
        "network": "tcp",
        "security": "tls",
        "tlsSettings": {
          "alpn": [
            "h2",
            "http/1.1"
          ],
          "certificates": [
            {
              "certificateFile": "{{CERT_PATH}}",
              "keyFile": "{{KEY_PATH}}"
            }
          ]
        }
      }
    }
  ],
  "outbounds": [
    {
      "tag": "direct",
      "protocol": "freedom"
    },
    {
      "tag": "block",
      "protocol": "blackhole"
    }
  ],
  "routing": {
    "rules": [
      {
        "type": "field",
        "protocol": [
          "bittorrent"
        ],
        "outboundTag": "block"
      }
    ]
  }
}
```

---

## Config B — Without Domain (Self-signed Certificate)

Use this when no domain is available. Identical to Config A except certificate paths point to self-signed certs. Clients use `pinnedPeerCertificateChainSha256` (or equivalent) instead of `allowInsecure`.

> **Note**: The `api.listen` field makes Xray's built-in API listen directly — do NOT add a separate `dokodemo-door` inbound for the API port, or you'll get a "bind: address already in use" error.

```json
{
  "log": {
    "loglevel": "warning",
    "access": "/var/log/xray/access.log",
    "error": "/var/log/xray/error.log"
  },
  "stats": {},
  "api": {
    "tag": "api",
    "listen": "127.0.0.1:{{API_PORT}}",
    "services": [
      "HandlerService",
      "StatsService"
    ]
  },
  "policy": {
    "levels": {
      "0": {
        "statsUserUplink": true,
        "statsUserDownlink": true
      }
    },
    "system": {
      "statsInboundUplink": true,
      "statsInboundDownlink": true,
      "statsOutboundUplink": true,
      "statsOutboundDownlink": true
    }
  },
  "inbounds": [
    {
      "tag": "trojan-in",
      "port": 443,
      "protocol": "trojan",
      "settings": {
        "clients": [],
        "fallbacks": [
          {
            "dest": 80
          }
        ]
      },
      "streamSettings": {
        "network": "tcp",
        "security": "tls",
        "tlsSettings": {
          "alpn": [
            "h2",
            "http/1.1"
          ],
          "certificates": [
            {
              "certificateFile": "{{CERT_PATH}}",
              "keyFile": "{{KEY_PATH}}"
            }
          ]
        }
      }
    }
  ],
  "outbounds": [
    {
      "tag": "direct",
      "protocol": "freedom"
    },
    {
      "tag": "block",
      "protocol": "blackhole"
    }
  ],
  "routing": {
    "rules": [
      {
        "type": "field",
        "protocol": [
          "bittorrent"
        ],
        "outboundTag": "block"
      }
    ]
  }
}
```

---

## Placeholders

| Placeholder | Description | How to determine |
|---|---|---|
| `{{API_PORT}}` | Xray gRPC API port | Default: `10085`. Must match the `stats_port` registered in TunPilot |
| `{{CERT_PATH}}` | TLS certificate file path | Config A: `/etc/xray/cert.pem` (symlink to Let's Encrypt). Config B: `/etc/xray/cert.pem` (self-signed) |
| `{{KEY_PATH}}` | TLS private key file path | Config A: `/etc/xray/key.pem` (symlink to Let's Encrypt). Config B: `/etc/xray/key.pem` (self-signed) |
| `{{DOMAIN}}` | Domain pointing to this server | User input (Config A only) |

---

## Decision Reference

### Trojan Fallback

The `fallbacks` array directs non-Trojan TCP traffic to port 80. This serves two purposes:

1. **Censorship resistance**: Active probers connecting to port 443 without valid Trojan credentials see a normal web server response, making the server look like a regular HTTPS site.
2. **Usability**: You can run nginx or a static page on port 80 to serve as the fallback target.

If you don't need a fallback website, the default `{"dest": 80}` will simply return a connection refused (or nginx default page if installed), which is still better than exposing the Trojan protocol to probers.

### gRPC API Security

The `api.listen` field binds the gRPC API to `127.0.0.1`, so it is **never exposed to the public internet**. TunPilot accesses it via SSH tunnel (`ssh -L`) when syncing users or querying stats.

> **Important**: Do NOT add a `dokodemo-door` inbound on the same API port. The `api.listen` field handles this directly. Using both will cause a "bind: address already in use" error.

### Empty Clients Array

The `clients: []` array starts empty. TunPilot dynamically adds/removes users via the Xray gRPC `HandlerService` API. After deploying, run `sync_xray_nodes` to push all assigned users to the node.

### Stats Collection

The `policy` block enables per-user upload/download stats tracking. TunPilot queries these via the `StatsService` gRPC API during traffic sync intervals to record usage in the traffic logs.

### Certificate Pinning (Config B)

When using self-signed certificates, clients should use certificate fingerprint pinning instead of `allowInsecure`. This provides:

- **Security**: Prevents MITM attacks (unlike `allowInsecure` which trusts any certificate)
- **Reliability**: No dependency on certificate authorities
- **Client support**: Shadowrocket (`peer=`), sing-box (`certificate=["sha256/..."]`), Clash (`fingerprint:`), Surge (`server-cert-fingerprint-sha256=`)

The SHA-256 fingerprint is computed from the self-signed certificate and stored in TunPilot's `cert_fingerprint` field on the node. Subscription format renderers automatically include it in generated configs.
