# Diagnostic Tooling Setup

Install the diagnostic dependencies and the `tunpilot-diag` wrapper on a proxy node. Required before running the `testing-nodes` skill.

## 1. Install dependencies

```bash
ssh <server> "apt-get update -qq && apt-get install -y -qq jq curl bc netcat-openbsd dnsutils iproute2 iperf3 mtr"
```

`NetQuality`'s remaining dependencies (`speedtest`, `nexttrace`) are auto-installed by the diagnostics script's `-y` flag on first run — no manual install needed.

## 2. Install `tunpilot-diag` wrapper

```bash
ssh <server> bash <<'DIAG_INSTALL'
curl -fsSL https://raw.githubusercontent.com/Buywatermelon/tunpilot/main/scripts/tunpilot-diag.sh \
  -o /usr/local/bin/tunpilot-diag
chmod +x /usr/local/bin/tunpilot-diag
tunpilot-diag --version
DIAG_INSTALL
```

## Verification

The wrapper should print its version when invoked. If `tunpilot-diag --version` fails after install, inspect the download with `ssh <server> "head -5 /usr/local/bin/tunpilot-diag"` to confirm the script body — a captive portal or proxy may have returned HTML instead of the script.
