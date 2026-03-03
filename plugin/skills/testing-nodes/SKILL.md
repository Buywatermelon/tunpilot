---
name: testing-nodes
description: Use when testing proxy node quality, running diagnostics, or generating a comprehensive node health report.
metadata:
  openclaw:
    emoji: "🔬"
    homepage: https://github.com/Buywatermelon/tunpilot
---

# TunPilot Node Diagnostics

Run comprehensive IP quality check on proxy nodes via SSH using [IPQuality](https://github.com/xykt/IPQuality). Queries 10 IP risk databases, checks streaming media unlock, and email blacklists — zero API keys required.

**Prerequisites:**
- Node must have `ssh_user` configured (and SSH key access from the TunPilot server)
- Node must have diagnostic dependencies installed: `jq curl bc netcat-openbsd dnsutils iproute2`

---

## Phase 1: Identify Target

Ask the user which node(s) to test. Use `list_nodes` to show available nodes if needed.

Accept:
- A single node name or ID
- "all" to test all enabled nodes that have `ssh_user` configured

---

## Phase 2: Run Diagnostics

For each target node, call `test_node_ipquality(node_id)`.

This runs the IPQuality script on the node via SSH (~60-120s). It returns structured JSON with sections: Head, Info, Type, Score, Factor, Media, Mail.

If testing multiple nodes, run them in parallel.

---

## Phase 3: Present Report

### 3.1 Single Node Report

For each node, present results using this structure:

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

---

## Phase 4: Analysis & Recommendations

Analyze each node and provide specific, actionable recommendations based on observed patterns. Don't use generic advice — reference actual data from the report.

### Analysis Patterns

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

### Multi-Node Recommendation

When comparing multiple nodes, explicitly state:
- Which node has better overall IP quality and why
- Which node is better for specific use cases (streaming, general browsing, ChatGPT)
- Any notable differences (e.g., "Node A unlocks TikTok but B doesn't")

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `SSH command failed (exit 255)` | SSH connection refused or auth failed | Verify `ssh_user` is correct, SSH key is set up, and the node is reachable. Test manually: `ssh <user>@<host> "echo ok"` |
| `SSH command failed (exit 1)` with empty output | SSH connected but command failed | Check if bash is available on the node. Try: `ssh <user>@<host> "which bash"` |
| "Invalid input, script exited" | IPQuality script dependencies missing | Install deps: `ssh <server> "apt-get update -qq && apt-get install -y -qq jq curl bc netcat-openbsd dnsutils iproute2"` |
| "No JSON found in output" | Script ran but produced no JSON | Script may have failed silently. Run manually: `ssh <user>@<host> "bash <(curl -sL IP.Check.Place) -j -4"` and check output |
| Tool times out (>120s) | Slow network or DNS issues on node | Check node's internet connectivity: `ssh <user>@<host> "curl -sL ifconfig.me"`. DNS blacklist check is usually the slowest part |
| `IPQS: null` in scores | IPQS API unreachable from node | Not a problem — just means IPQS couldn't be queried. Other 5 score providers still give useful data |

---

## MCP Tools Reference

| Tool | Use When |
|------|----------|
| `list_nodes` | See all registered nodes and their ssh_user config |
| `test_node_ipquality` | Run the diagnostic check (~60-120s per node) |
| `check_health` | Quick health check before running diagnostics |
