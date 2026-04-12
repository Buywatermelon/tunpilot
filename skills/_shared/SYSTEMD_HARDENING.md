# Systemd Hardening Template

Parameterized systemd drop-in template for hardening a proxy service. Caller supplies `SERVICE`, `READ_WRITE_PATHS`, and optionally `CAPABILITIES`.

## Parameters

| Placeholder | Example (Hysteria2) | Example (Xray) |
|-------------|---------------------|----------------|
| `{{SERVICE}}` | `hysteria-server` | `xray` |
| `{{READ_WRITE_PATHS}}` | `/etc/hysteria` | `/usr/local/etc/xray /etc/xray /var/log/xray` |
| `{{CAPABILITIES}}` (optional) | `CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW` | *(omit — Xray does not need these)* |

## Template

```bash
ssh <server> bash <<'SYSTEMD'
mkdir -p /etc/systemd/system/{{SERVICE}}.service.d

cat > /etc/systemd/system/{{SERVICE}}.service.d/hardening.conf << 'EOF'
[Service]
LimitNOFILE=65536
NoNewPrivileges=true
# If {{CAPABILITIES}} is set, include the two lines below; otherwise omit both.
AmbientCapabilities={{CAPABILITIES}}
CapabilityBoundingSet={{CAPABILITIES}}
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths={{READ_WRITE_PATHS}}
EOF

systemctl daemon-reload
SYSTEMD
```

## Notes

- `LimitNOFILE=65536` raises the fd limit for high-concurrency proxy workloads.
- `ProtectSystem=strict` makes the entire filesystem read-only except `ReadWritePaths`. If the service legitimately needs to write outside these paths, add them to the list rather than relaxing the setting.
- `AmbientCapabilities` / `CapabilityBoundingSet` are only needed when the service runs as an unprivileged user but must bind privileged ports or access raw sockets. Hysteria2 needs them; Xray (running as root) does not.
- `PrivateTmp=true` is safe for nearly all proxy services and is included by default.
