---
name: testing-nodes
description: "Runs IP reputation checks (risk scores, streaming unlock, blacklists) and network performance tests (latency, speed, routing) on proxy nodes via SSH. Generates structured health reports with actionable recommendations. Use when testing proxy node quality, checking IP risk scores, verifying streaming unlock status, running network speed tests, diagnosing node latency, or comparing multiple nodes side-by-side."
metadata:
  openclaw:
    requires:
      bins:
        - ssh
    emoji: "🔬"
    homepage: https://github.com/Buywatermelon/tunpilot
---

# TunPilot Node Diagnostics

Run dual-dimension diagnostics on proxy nodes via direct SSH: [IPQuality](https://github.com/xykt/IPQuality) for IP reputation (risk scores, streaming unlock, blacklists) and [NetQuality](https://github.com/xykt/NetQuality) for network performance (BGP, latency, speed, routing). Both tools require zero API keys.

**Prerequisites:**
- Node must have `ssh_user` or `ssh_alias` configured (and SSH key access from the local machine)
- `tunpilot-diag` wrapper installed on the node (auto-installed in Phase 2.0 if missing)

See [REFERENCE.md](REFERENCE.md) for interpretation guides, classification tables, and analysis patterns used in report rendering.

---

## Phase 1: Identify Target

Ask the user which node(s) to test. Use `list_nodes` to show available nodes if needed.

Accept:
- A single node name or ID
- "all" to test all enabled nodes that have `ssh_user` or `ssh_alias` configured

---

## Phase 2: Run Diagnostics

For each target node, get `ssh_alias`, `ssh_user`, `host`, and `ssh_port` from the `list_nodes` result.

**Resolve SSH target** (use throughout this phase):
- If `ssh_alias` is set → use `ssh <ssh_alias>` (e.g., `ssh bwg`)
- Otherwise → use `ssh -p <ssh_port> <ssh_user>@<host>`

All SSH commands below use `<ssh_target>` as shorthand for the resolved target.

### 2.0 Pre-flight Check

Verify `tunpilot-diag` is installed on each target node:

```bash
ssh <ssh_target> "tunpilot-diag --version"
```

If the command fails (not found), install it:

```bash
ssh <ssh_target> bash <<'INSTALL'
curl -fsSL https://raw.githubusercontent.com/Buywatermelon/tunpilot/main/scripts/tunpilot-diag.sh \
  -o /usr/local/bin/tunpilot-diag
chmod +x /usr/local/bin/tunpilot-diag
tunpilot-diag --version
INSTALL
```

Also ensure diagnostic dependencies are installed:

```bash
ssh <ssh_target> "apt-get update -qq && apt-get install -y -qq jq curl bc netcat-openbsd dnsutils iproute2 iperf3 mtr"
```

### 2.1 Execute Diagnostics

`tunpilot-diag` supports subcommands:
- `tunpilot-diag all` — full suite: IPQuality + NetQuality (~5-7 min) **(default)**
- `tunpilot-diag ip` — IP reputation only (~2-3 min)
- `tunpilot-diag net` — network performance only (~3-5 min)

Run the full diagnostics suite:

```bash
ssh <ssh_target> "tunpilot-diag"
```

Output is two JSON lines on stdout:
- Line 1: `{"type":"ipquality","data":{...}}` — use the `data` field for report rendering
- Line 2: `{"type":"netquality","data":{...}}` — use the `data` field for report rendering

If a check fails, the line will contain `"error"` instead of `"data"`.

### Execution Strategy

**Single node**: Use `run_in_background` so the agent is not blocked while diagnostics run. Tell the user diagnostics are running (~5-7 min).

**Multiple nodes**: Launch each node's diagnostics in parallel using separate `run_in_background` Bash calls.

### Fallback (if tunpilot-diag cannot be installed)

Fall back to raw script execution with output filtering:

```bash
ssh <ssh_target> "export TERM=dumb; bash <(curl -sL IP.Check.Place) -j -4" 2>&1 \
  | sed 's/\x1b\[[0-9;]*m//g' > /tmp/ipquality-<node>.txt
```

Extract JSON from the raw output:

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

### 3.1 Single Node Report

For each node, present results in two sections: IP Quality first, then Network Quality. Use the interpretation guides in [REFERENCE.md](REFERENCE.md) for score ratings, classification, and pattern matching.

---

### IP Quality (from IPQuality SSH)

#### IP Information

| Item | Value |
|------|-------|
| IP | {Head.IP} |
| Location | {Info.City.Name}, {Info.City.Subdivisions}, {Info.Region.Name} |
| ASN | AS{Info.ASN} — {Info.Organization} |
| IP Type | {Info.Type} (see IP Type Guide in REFERENCE.md) |
| Timezone | {Info.TimeZone} |

#### Usage Classification

Present what all 5 databases say about this IP's usage type:

| Database | Usage | Company |
|----------|-------|---------|
| IPinfo | {Type.Usage.IPinfo} | {Type.Company.IPinfo} |
| ipregistry | {Type.Usage.ipregistry} | {Type.Company.ipregistry} |
| ipapi | {Type.Usage.ipapi} | {Type.Company.ipapi} |
| AbuseIPDB | {Type.Usage.AbuseIPDB} | — |
| IP2LOCATION | {Type.Usage.IP2LOCATION} | — |

Interpret using the Classification Guide and Consensus Analysis in [REFERENCE.md](REFERENCE.md).

#### Risk Scores

| Database | Score | Rating |
|----------|-------|--------|
| IP2LOCATION | {Score.IP2LOCATION} | {rating} |
| SCAMALYTICS | {Score.SCAMALYTICS} | {rating} |
| ipapi | {Score.ipapi} | {rating} |
| AbuseIPDB | {Score.AbuseIPDB} | {rating} |
| IPQS | {Score.IPQS} | {rating} |
| DBIP | {Score.DBIP} | {rating} |

Rate each score using the Risk Score Interpretation table in [REFERENCE.md](REFERENCE.md).

#### Detection Factors (across 9 providers)

| Factor | Flagged By | Count |
|--------|-----------|-------|
| Proxy | {list providers where true, or "None"} | {N}/9 |
| VPN | {list providers where true, or "None"} | {N}/9 |
| Tor | {list providers where true, or "None"} | {N}/9 |
| Server/DC | {list providers where true, or "None"} | {N}/9 |
| Abuser | {list providers where true, or "None"} | {N}/9 |
| Robot | {list providers where true, or "None"} | {N}/9 |

#### Streaming Media Unlock

| Service | Status | Region | Type |
|---------|--------|--------|------|
| TikTok | {Media.TikTok.Status} | {Region} | {Type} |
| Disney+ | {Media.DisneyPlus.Status} | {Region} | {Type} |
| Netflix | {Media.Netflix.Status} | {Region} | {Type} |
| YouTube | {Media.Youtube.Status} | {Region} | {Type} |
| Amazon Prime | {Media.AmazonPrimeVideo.Status} | {Region} | {Type} |
| Reddit | {Media.Reddit.Status} | {Region} | {Type} |
| ChatGPT | {Media.ChatGPT.Status} | {Region} | {Type} |

#### Email & Blacklists

| Item | Status |
|------|--------|
| Port 25 (SMTP) | {open/closed} |
| DNS Blacklist | {Clean}/{Total} clean, {Marked} marked, {Blacklisted} blacklisted |

Major mail providers:

| Provider | Reachable |
|----------|-----------|
| Gmail | {yes/no} |
| Outlook | {yes/no} |
| Yahoo | {yes/no} |
| Apple | {yes/no} |
| QQ | {yes/no} |
| 163 | {yes/no} |

---

### Network Quality (from NetQuality SSH)

#### BGP Information

| Item | Value |
|------|-------|
| ASN | AS{BGP.ASN} — {BGP.Organization} |
| Prefix | {BGP.Prefix} ({BGP.IPinTotal} IPs total, {BGP.IPActive} active) |
| RIR | {BGP.RIR} |
| Country | {BGP.Country} |
| Registered | {BGP.RegDate} |
| Upstreams | {BGP.UpstreamsCount} |
| Peers | {BGP.PeersCount} |
| IX Count | {BGP.IXCount} |

#### Local Network Policy

| Item | Value |
|------|-------|
| NAT Type | {Local.NAT} — {Local.NATDescribe} |
| Mapping | {Local.Mapping} |
| Filter | {Local.Filter} |
| TCP Congestion Control | {Local.TCPCongestionControl} |
| Queue Discipline | {Local.QueueDiscipline} |

Interpret NAT type and TCP congestion control using [REFERENCE.md](REFERENCE.md).

#### Tier-1 Connectivity

| ASN | Organization | Tier-1 | Upstream |
|-----|-------------|--------|----------|
| {Connectivity[].ASN} | {Connectivity[].Org} | {IsTier1: Yes/No} | {IsUpstream: Yes/No} |

Highlight entries where `IsUpstream` is true — these are the node's direct transit providers. More Tier-1 upstreams = better international connectivity and redundancy.

#### Three-Network Latency (31 Provinces)

**Key Regions Summary** (show these first):

| Province | CT (ms) | CU (ms) | CM (ms) |
|----------|---------|---------|---------|
| 北京 BJ | {CT.Average} | {CU.Average} | {CM.Average} |
| 上海 SH | {CT.Average} | {CU.Average} | {CM.Average} |
| 广东 GD | {CT.Average} | {CU.Average} | {CM.Average} |
| 浙江 ZJ | {CT.Average} | {CU.Average} | {CM.Average} |
| 江苏 JS | {CT.Average} | {CU.Average} | {CM.Average} |
| 四川 SC | {CT.Average} | {CU.Average} | {CM.Average} |

Rate latency values and analyze per-ISP averages using [REFERENCE.md](REFERENCE.md). Present the full 31-province table when user asks for detailed view.

#### Domestic Speed Test

Convert raw values to Mbps if in bytes/s format: `value / 1024 / 1024 * 8`.

| City | Provider | Upload (Mbps) | Download (Mbps) |
|------|----------|---------------|-----------------|
| {Speedtest[].City} | {Speedtest[].Provider} | {SendSpeed} | {ReceiveSpeed} |

#### International Interconnection

Convert raw values to Mbps if in bytes/s format: `value / 1024 / 1024 * 8`.

| City | Upload (Mbps) | Download (Mbps) | Send Retransmits | Recv Retransmits | Latency (ms) |
|------|---------------|-----------------|------------------|------------------|--------------|
| {Transfer[].City} | {SendSpeed} | {ReceiveSpeed} | {SendRetransmits} | {ReceiveRetransmits} | {Delay.Average} |

### 3.2 Multi-Node Comparison (when testing 2+ nodes)

Present a side-by-side comparison table:

| Item | {node1_name} | {node2_name} | ... |
|------|-------------|-------------|-----|
| **IP** | {ip} | {ip} | |
| **Location** | {city, region} | {city, region} | |
| **ASN** | {asn} | {asn} | |
| **IP Type** | {type} | {type} | |
| **Usage** | {consensus} | {consensus} | |
| **IP2LOCATION** | {score} | {score} | |
| **SCAMALYTICS** | {score} | {score} | |
| **Proxy Detection** | {N}/9 | {N}/9 | |
| **VPN Detection** | {N}/9 | {N}/9 | |
| **Netflix** | {status} | {status} | |
| **Disney+** | {status} | {status} | |
| **YouTube** | {status} | {status} | |
| **ChatGPT** | {status} | {status} | |
| **TikTok** | {status} | {status} | |
| **Port 25** | {open/closed} | {open/closed} | |
| **DNS Blacklist** | {blacklisted} | {blacklisted} | |
| **Best ISP** | {CT/CU/CM} | {CT/CU/CM} | |
| **Avg Latency (CT)** | {ms} | {ms} | |
| **Avg Latency (CU)** | {ms} | {ms} | |
| **Avg Latency (CM)** | {ms} | {ms} | |
| **HK Speed** | {Mbps} | {Mbps} | |
| **Tokyo Speed** | {Mbps} | {Mbps} | |
| **LA Speed** | {Mbps} | {Mbps} | |

---

## Phase 4: Analysis & Recommendations

Analyze each node using the IP Quality Patterns and Network Quality Patterns in [REFERENCE.md](REFERENCE.md). Provide specific, actionable recommendations referencing actual data from the report — avoid generic advice.

For multi-node comparisons, follow the Multi-Node Recommendation guidelines in [REFERENCE.md](REFERENCE.md).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `SSH command failed (exit 255)` | SSH connection refused or auth failed | Verify `ssh_alias`/`ssh_user`, SSH key setup, and node reachability. Test: `ssh <ssh_target> "echo ok"` |
| `SSH command failed (exit 1)` | SSH connected but command failed | Check bash availability: `ssh <ssh_target> "which bash"` |
| "Invalid input, script exited" | IPQuality dependencies missing | Install: `apt-get install -y -qq jq curl bc netcat-openbsd dnsutils iproute2` |
| "No JSON found in output" | Script produced no JSON | Run manually: `ssh <ssh_target> "bash <(curl -sL IP.Check.Place) -j -4"` |
| `IPQS: null` in scores | IPQS API unreachable | Not a problem — other 5 providers still give useful data |
| NetQuality timeout (>10 min) | Full mode too slow | Use `tunpilot-diag ip` for quick IP-only check |
| iperf3 not installed | Missing dependency | Install: `apt-get install -y -qq iperf3 mtr` |
| "speedtest not found" persists | Auto-install via `-y` failed | Manual install: `curl -s https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh \| bash && apt-get install -y speedtest` |

---

## MCP Tools Reference

| Tool | Use When |
|------|----------|
| `list_nodes` | See all registered nodes and their ssh_alias/ssh_user config |
| `check_health` | Quick health check before running diagnostics |
