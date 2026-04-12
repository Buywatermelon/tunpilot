---
name: testing-nodes
description: "Runs IP reputation checks (risk scores, streaming unlock, blacklists via 9 providers) and network performance tests (BGP, latency, speed, routing to 31 Chinese provinces) on proxy nodes via SSH. Generates structured health reports with actionable recommendations. Use when testing proxy node quality, checking IP risk scores, verifying streaming unlock status, running speed tests, diagnosing latency, or comparing multiple nodes side-by-side."
metadata:
  openclaw:
    requires:
      bins:
        - ssh
    emoji: "🔬"
    homepage: https://github.com/Buywatermelon/tunpilot
---

# TunPilot Node Diagnostics

Dual-dimension diagnostics via direct SSH: [IPQuality](https://github.com/xykt/IPQuality) for IP reputation (risk scores, streaming unlock, blacklists) and [NetQuality](https://github.com/xykt/NetQuality) for network performance (BGP, latency, speed, routing). Zero API keys required.

**Prerequisites:**

- Node has `ssh_user` or `ssh_alias` configured and SSH key access from the local machine.
- `tunpilot-diag` wrapper installed on the node (auto-installed in Phase 2.0 if missing).

**Auxiliary files (read when referenced below):**

- [REPORT_TEMPLATE.md](REPORT_TEMPLATE.md) — table templates for rendering results (Phase 3)
- [REFERENCE.md](REFERENCE.md) — score/classification interpretation + recommendation patterns (Phase 3/4)
- [../_shared/DIAG_SETUP.md](../_shared/DIAG_SETUP.md) — install tooling if Phase 2.0 detects it missing
- [../_shared/SSH_TROUBLESHOOTING.md](../_shared/SSH_TROUBLESHOOTING.md) — generic SSH/systemd issues

---

## Phase 1: Identify Target

Ask the user which node(s) to test. Use `list_nodes` to show available nodes if needed.

Accept:

- A single node name or ID
- `all` → all enabled nodes that have `ssh_user` or `ssh_alias`

---

## Phase 2: Run Diagnostics

For each target node, fetch `ssh_alias`, `ssh_user`, `host`, `ssh_port` via `list_nodes`.

**Resolve SSH target** (used as `<ssh_target>` below):

- If `ssh_alias` set → `ssh <ssh_alias>`
- Otherwise → `ssh -p <ssh_port> <ssh_user>@<host>`

### 2.0 Pre-flight Check

```bash
ssh <ssh_target> "tunpilot-diag --version"
```

If missing, read [../_shared/DIAG_SETUP.md](../_shared/DIAG_SETUP.md) and run both steps on this node.

### 2.1 Execute Diagnostics

`tunpilot-diag` subcommands:

- `tunpilot-diag` / `tunpilot-diag all` — IPQuality + NetQuality (~5-7 min)
- `tunpilot-diag ip` — IP reputation only (~2-3 min)
- `tunpilot-diag net` — network performance only (~3-5 min)

Full suite:

```bash
ssh <ssh_target> "tunpilot-diag"
```

Output is two JSON lines on stdout:

- Line 1: `{"type":"ipquality","data":{...}}`
- Line 2: `{"type":"netquality","data":{...}}`

If a check fails the line contains `"error"` instead of `"data"`.

### Execution Strategy

- **Single node** — Use `run_in_background`; tell the user it runs ~5-7 min. The runtime notifies on completion.
- **Multiple nodes** — Launch each node in parallel via separate `run_in_background` Bash calls (independent SSH sessions).

### Fallback (if `tunpilot-diag` cannot be installed)

Run the raw scripts with ANSI filtering and extract JSON:

```bash
ssh <ssh_target> "export TERM=dumb; bash <(curl -sL IP.Check.Place) -j -4" 2>&1 \
  | sed 's/\x1b\[[0-9;]*m//g' > /tmp/ipquality-<node>.txt
```

```python
python3 -c "
import json, sys
content = open('/tmp/ipquality-<node>.txt').read()
depth, start = 0, -1
for i, c in enumerate(content):
    if c == '{' and start == -1: start, depth = i, 1
    elif start >= 0:
        depth += (c == '{') - (c == '}')
        if depth == 0:
            data = json.loads(content[start:i+1])
            if 'Head' in data or 'Info' in data:
                print(json.dumps(data)); break
            start = -1
"
```

Repeat for NetQuality with `Net.Check.Place` and `-j -4 -y` flags.

---

## Phase 3: Present Report

Read [REPORT_TEMPLATE.md](REPORT_TEMPLATE.md) for the full table layout. Use [REFERENCE.md](REFERENCE.md) for score ratings, classification consensus analysis, and pattern matching.

- **Single node** — render all sections from the template in order (IP Quality → Network Quality).
- **Multi-node (2+)** — render the Multi-Node Comparison table from the template.

---

## Phase 4: Analysis & Recommendations

Analyse each node using the IP Quality Patterns and Network Quality Patterns in [REFERENCE.md](REFERENCE.md). Provide specific, actionable recommendations referencing actual data from the report — avoid generic advice.

For multi-node comparisons, follow the Multi-Node Recommendation guidelines in REFERENCE.md.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Invalid input, script exited" | IPQuality dependencies missing | `apt-get install -y -qq jq curl bc netcat-openbsd dnsutils iproute2` |
| "No JSON found in output" | Script produced no JSON (captive portal, ANSI leak, etc.) | Run raw: `ssh <ssh_target> "bash <(curl -sL IP.Check.Place) -j -4"` |
| `IPQS: null` in scores | IPQS API unreachable | Not a problem — other 5 providers still give useful data |
| NetQuality timeout (>10 min) | Full mode too slow for this server | `tunpilot-diag ip` for quick IP-only check, or `tunpilot-diag net` without speedtest |
| iperf3 not installed | Missing dependency | `apt-get install -y -qq iperf3 mtr` |
| "speedtest not found" persists | `-y` auto-install failed | `curl -s https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh \| bash && apt-get install -y speedtest` |

For generic SSH / systemd failures, see [../_shared/SSH_TROUBLESHOOTING.md](../_shared/SSH_TROUBLESHOOTING.md).

---

## CLI Reference

| Command | Use When |
|---------|----------|
| `tunpilot node list` | See registered nodes with ssh_alias/ssh_user config |
| `tunpilot health [<id>]` | Quick health check before running diagnostics |
