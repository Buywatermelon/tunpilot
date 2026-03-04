---
name: testing-nodes
description: Use when testing proxy node quality, running diagnostics, or generating a comprehensive node health report.
metadata:
  openclaw:
    requires:
      bins:
        - ssh
    emoji: "🔬"
    homepage: https://github.com/Buywatermelon/tunpilot
---

# TunPilot Node Diagnostics

Run dual-dimension diagnostics on proxy nodes via direct SSH from the local machine: [IPQuality](https://github.com/xykt/IPQuality) for IP reputation (risk scores, streaming unlock, blacklists) and [NetQuality](https://github.com/xykt/NetQuality) for network performance (BGP, latency, speed, routing). Both tools require zero API keys.

**Prerequisites:**
- Node must have `ssh_user` or `ssh_alias` configured (and SSH key access from the local machine)
- `tunpilot-diag` wrapper installed on the node (auto-installed in Phase 2.0 if missing)
- IPQuality dependencies: `jq curl bc netcat-openbsd dnsutils iproute2`
- NetQuality dependencies: `iperf3 mtr` (plus `speedtest`, `nexttrace` auto-installed by the script with `-y` flag)

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

Run the full diagnostics suite (IPQuality + NetQuality):

```bash
ssh <ssh_target> "tunpilot-diag"
```

Output is two JSON lines on stdout:
- Line 1: `{"type":"ipquality","data":{...}}` — use the `data` field for report rendering
- Line 2: `{"type":"netquality","data":{...}}` — use the `data` field for report rendering

If a check fails, the line will contain `"error"` instead of `"data"`.

### Execution Strategy

**Single node**: Use `run_in_background` so the agent is not blocked while diagnostics run. Tell the user diagnostics are running (~5-7 min). The agent will be automatically notified when the command completes.

**Multiple nodes**: Launch each node's diagnostics in parallel using separate `run_in_background` Bash calls. Each node runs independently via separate SSH sessions.

### Fallback (if tunpilot-diag cannot be installed)

If the wrapper cannot be installed (e.g., permission issues, no curl), fall back to raw script execution with output filtering:

```bash
ssh <ssh_target> "export TERM=dumb; bash <(curl -sL IP.Check.Place) -j -4" 2>&1 \
  | sed 's/\x1b\[[0-9;]*m//g' > /tmp/ipquality-<node>.txt
```

Then extract JSON from the raw output using Python:

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

For each node, present results in two sections: IP Quality first, then Network Quality.

---

### IP Quality (from IPQuality SSH)

#### IP Information

| Item | Value |
|------|-------|
| IP | {Head.IP} |
| Location | {Info.City.Name}, {Info.City.Subdivisions}, {Info.Region.Name} |
| ASN | AS{Info.ASN} — {Info.Organization} |
| IP Type | {Info.Type} (see classification guide below) |
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

**Classification Guide:**

| Chinese Label | English | Meaning | Quality Impact |
|---------------|---------|---------|----------------|
| 家宽 | Residential | ISP consumer line | Best — lowest detection risk, ideal for streaming and general use |
| 商业 | Business | Commercial/enterprise line | Good — some services may have minor restrictions |
| 机房 | Datacenter/Hosting | Server/cloud provider | Poor — most IP databases flag datacenter IPs, streaming services likely restrict |
| 教育 | Education | University/school network | Variable — depends on specific institution |

**IP Type Guide:**

| Chinese Label | English | Meaning |
|---------------|---------|---------|
| 原生IP | Native IP | IP registered to the local ISP in the server's country. Best for geo-restricted services |
| 广播IP | Broadcast/Anycast IP | IP announced via BGP from a different region than registration. May trigger geo-mismatch flags |

**Consensus Analysis:**
- All 5 agree → high confidence classification
- 4/5 agree → strong classification, 1 outlier is likely noise
- Mixed results → borderline IP, classification may be disputed by some services

#### Risk Scores

| Database | Score | Rating |
|----------|-------|--------|
| IP2LOCATION | {Score.IP2LOCATION} | {rating} |
| SCAMALYTICS | {Score.SCAMALYTICS} | {rating} |
| ipapi | {Score.ipapi} | {rating} |
| AbuseIPDB | {Score.AbuseIPDB} | {rating} |
| IPQS | {Score.IPQS} | {rating} |
| DBIP | {Score.DBIP} | {rating} |

**Score Interpretation Guide:**

| Database | Low Risk | Medium Risk | High Risk | Notes |
|----------|----------|-------------|-----------|-------|
| IP2LOCATION | 0-20 | 20-80 | 80-100 | Proxy score. Datacenter IPs often score 99 regardless of actual abuse |
| SCAMALYTICS | 0-20 | 20-50 | 50+ | Fraud score. Very sensitive to datacenter classification |
| ipapi | <1% | 1-10% | 10%+ | Threat percentage. Most clean IPs show <1% |
| AbuseIPDB | 0-10 | 10-50 | 50+ | Confidence of abuse. Based on user reports |
| IPQS | 0-30 | 30-75 | 75+ | Fraud score. "null" means API unreachable, not a risk indicator |
| DBIP | 0 | — | 1+ | Binary. 0 = clean, any positive value = flagged |

#### Detection Factors (across 9 providers)

| Factor | Flagged By | Count |
|--------|-----------|-------|
| Proxy | {list providers where true, or "None"} | {N}/9 |
| VPN | {list providers where true, or "None"} | {N}/9 |
| Tor | {list providers where true, or "None"} | {N}/9 |
| Server/DC | {list providers where true, or "None"} | {N}/9 |
| Abuser | {list providers where true, or "None"} | {N}/9 |
| Robot | {list providers where true, or "None"} | {N}/9 |

**Detection Pattern Analysis:**

| Detection Count | Assessment | Impact |
|----------------|------------|--------|
| 0/9 flagged | Clean IP, excellent quality | No restrictions expected |
| 1-2/9 flagged | Borderline, likely false positive | Usually fine, most services won't block |
| 3-5/9 flagged | Moderate risk | Some services will flag or restrict, streaming may be limited |
| 6+/9 flagged | High risk | Most services will detect and restrict this IP |

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

**Status meanings:**
- 解锁 + 原生 = native unlock, best quality — service directly available from this IP
- 解锁 + DNS = DNS-based unlock — works but may change if DNS detection improves
- 失败 = blocked — service actively rejects this IP

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

**NAT Type Interpretation:**

| NAT Type | Chinese | Impact |
|----------|---------|--------|
| Full Cone | 全锥形 | Best — ideal for P2P, gaming, and VoIP |
| Restricted Cone | 受限锥形 | Good — works for most applications |
| Port Restricted Cone | 端口受限锥形 | OK — some P2P may have issues |
| Symmetric | 对称型 | Worst — problematic for P2P and gaming, NAT traversal difficult |

**TCP Congestion Control:**

| Algorithm | Notes |
|-----------|-------|
| `bbr` | Recommended for proxy servers — best throughput on lossy/long-distance links |
| `cubic` | Linux default — adequate but suboptimal for high-latency proxy use |
| `hybla` | Designed for high-latency satellite links — good alternative for long-distance |

#### Tier-1 Connectivity

| ASN | Organization | Tier-1 | Upstream |
|-----|-------------|--------|----------|
| {Connectivity[].ASN} | {Connectivity[].Org} | {IsTier1: Yes/No} | {IsUpstream: Yes/No} |

Highlight entries where `IsUpstream` is true — these are the node's direct transit providers.

**Interpretation:** More Tier-1 upstreams = better international connectivity and redundancy. A node with direct Tier-1 upstream (e.g., Cogent AS174, Lumen AS3356, NTT AS2914) typically has lower latency and more stable international routing.

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

**Latency Rating Guide:**

| Range | Rating | User Experience |
|-------|--------|-----------------|
| <50ms | Excellent | Imperceptible delay |
| 50-100ms | Good | Smooth browsing and video |
| 100-200ms | Fair | Noticeable on interactive apps |
| 200-500ms | Poor | Laggy, affects real-time use |
| >500ms / 0 | Timeout | Route broken or severely congested |

**Analysis Instructions:**
- Calculate per-ISP national average across all provinces
- Identify which ISP has the best (lowest) average latency for this node
- Flag provinces where Average = "0" — this means timeout (route broken), not 0ms latency
- Flag provinces with anomalously high values (>3x the national average for that ISP)
- Note: CT = China Telecom, CU = China Unicom, CM = China Mobile

**Full 31-Province Table** (present when user asks for detailed view or "show all provinces"):

| Province | CT (ms) | CU (ms) | CM (ms) |
|----------|---------|---------|---------|
| {Delay[].Name} | {CT.Average} | {CU.Average} | {CM.Average} |
| ... | ... | ... | ... |

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

**Speed Rating:**

| Speed | Rating |
|-------|--------|
| >50 Mbps | Excellent |
| 10-50 Mbps | Good |
| 1-10 Mbps | Fair |
| <1 Mbps | Poor |

**Retransmit Analysis:** High retransmit counts (>10000) indicate a congested or lossy path. This often points to throttling by intermediate ISPs or overloaded peering points.

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

Analyze each node and provide specific, actionable recommendations based on observed patterns. Don't use generic advice — reference actual data from the report.

### IP Quality Patterns

Identify which pattern(s) apply to each node and explain accordingly:

**Pattern: Premium Residential**
- Usage: all providers say "residential"
- IP type: native
- Detection: 0/9 on all factors
- Risk scores: all low
- Recommendation: "Excellent IP quality. This is a residential native IP with zero detection flags. Ideal for all use cases including streaming and sensitive services."

**Pattern: Standard Datacenter**
- Usage: most providers say "datacenter/hosting"
- Detection: VPN/Proxy flagged by 3+/9 providers, Server flagged by 4+/9
- Risk scores: IP2LOCATION 80+, others may be low
- Recommendation: "Typical datacenter IP. High IP2LOCATION score ({score}) is expected for datacenter IPs and doesn't indicate abuse — it's a classification score, not a threat score. Streaming services that check IP type (Netflix, TikTok) may block this IP, while others (YouTube, ChatGPT) typically allow it."

**Pattern: High-Quality Datacenter**
- Usage: datacenter, but low detection flags
- Detection: 0-2/9 flagged
- Risk scores: mostly low despite datacenter classification
- Recommendation: "Above-average datacenter IP. Despite being classified as datacenter, detection flags are minimal. Most services should work, though some streaming platforms may still restrict based on IP type alone."

**Pattern: Compromised or Abused IP**
- Detection: Abuser flagged by 3+/9 providers
- Risk scores: AbuseIPDB 50+
- DNS blacklist: blacklisted count > 0
- Recommendation: "This IP shows signs of prior abuse. {N} providers flag it as an abuser, and it appears on {blacklisted} DNS blacklists. Email delivery will be unreliable. Consider requesting a new IP from the provider."

**Pattern: Port 25 Blocked (Common for Cloud)**
- Port 25: closed, all mail providers unreachable
- Recommendation: "Port 25 (SMTP) is blocked by the hosting provider — this is standard practice for cloud/VPS providers to prevent spam. Email sending is not possible from this IP. This does not affect proxy usage."

### Network Quality Patterns

**Pattern: Premium Network**
- Low latency across all three ISPs (<100ms national average)
- TCP congestion control: BBR
- NAT: Full Cone or no NAT
- International speed: >50 Mbps to major cities
- Recommendation: "Excellent network quality. Low latency to all three Chinese ISPs, BBR congestion control, and strong international throughput. This node is well-suited for latency-sensitive applications."

**Pattern: CT-Optimized (CN2/CN2 GIA)**
- CT latency significantly lower than CU and CM (e.g., CT <80ms while CU/CM >150ms)
- Few or no CT timeout provinces
- Recommendation: "This node appears to use premium China Telecom routing (likely CN2 or CN2 GIA). CT users will have the best experience. CU and CM users may see higher latency due to non-optimized peering."

**Pattern: CU-Optimized (AS9929/AS4837)**
- CU latency lowest among the three ISPs
- CT and CM latency noticeably higher
- Recommendation: "This node has optimized China Unicom routing (likely AS9929 or AS4837 premium). CU users will have the best experience. Consider pairing with a CT-optimized node for full coverage."

**Pattern: CM-Optimized (CMIN2/CMI)**
- CM latency lowest among the three ISPs
- CT and CU latency higher
- Recommendation: "This node has optimized China Mobile routing (likely CMIN2 or CMI). CM users will have the best experience. China Mobile's international backbone has improved significantly — this is a good choice for CM-heavy user bases."

**Pattern: Poor Routing**
- High latency with many timeout provinces (Average = "0")
- High TCP retransmits on international paths (>10000)
- Recommendation: "This node has routing issues. {N} provinces show timeouts, and international paths show high retransmit rates. This suggests congested or broken peering. Consider switching to a provider with better China connectivity."

### Multi-Node Recommendation

When comparing multiple nodes, explicitly state:
- Which node has better overall IP quality and why
- Which node is better for specific use cases (streaming, general browsing, ChatGPT)
- Any notable differences (e.g., "Node A unlocks TikTok but B doesn't")
- Which node has better network performance for each ISP (CT/CU/CM)
- Optimal node assignment per user based on their ISP

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `SSH command failed (exit 255)` | SSH connection refused or auth failed | Verify `ssh_alias` or `ssh_user` is correct, SSH key is set up, and the node is reachable. Test manually: `ssh <ssh_target> "echo ok"` |
| `SSH command failed (exit 1)` with empty output | SSH connected but command failed | Check if bash is available on the node. Try: `ssh <ssh_target> "which bash"` |
| "Invalid input, script exited" | IPQuality script dependencies missing | Install deps: `ssh <ssh_target> "apt-get update -qq && apt-get install -y -qq jq curl bc netcat-openbsd dnsutils iproute2"` |
| "No JSON found in output" | Script ran but produced no JSON | Script may have failed silently. Run manually: `ssh <ssh_target> "bash <(curl -sL IP.Check.Place) -j -4"` and check output |
| IPQuality times out (>120s) | Slow network or DNS issues on node | Check node's internet connectivity: `ssh <ssh_target> "curl -sL ifconfig.me"`. DNS blacklist check is usually the slowest part |
| `IPQS: null` in scores | IPQS API unreachable from node | Not a problem — just means IPQS couldn't be queried. Other 5 score providers still give useful data |
| NetQuality timeout (>10 min) | Full mode too slow for this server | Use `ping` mode for quick latency check, or `low` mode to skip speedtest |
| iperf3 errors in NetQuality | `iperf3` not installed on the node | Install: `ssh <ssh_target> "apt-get update -qq && apt-get install -y -qq iperf3 mtr"` |
| "speedtest not found" in NetQuality | speedtest CLI missing | Will be auto-installed on next run (the `-y` flag enables auto-install). If it persists, install manually: `ssh <ssh_target> "curl -s https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh | bash && apt-get install -y speedtest"` |

---

## MCP Tools Reference

| Tool | Use When |
|------|----------|
| `list_nodes` | See all registered nodes and their ssh_alias/ssh_user config |
| `check_health` | Quick health check before running diagnostics |
