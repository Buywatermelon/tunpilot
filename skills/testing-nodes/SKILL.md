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

**Prerequisite**: Node must have `ssh_user` configured (and SSH key access from the TunPilot server).

---

## Phase 1: Identify Target

Ask the user which node(s) to test. Use `list_nodes` to show available nodes if needed.

Accept:
- A single node name or ID
- "all" to test all enabled nodes that have `ssh_user` configured

---

## Phase 2: Run Diagnostics

For each target node, call `test_node_ipquality(node_id)`.

This runs the IPQuality script on the node via SSH (~60-120s). It returns structured JSON with sections: Info, Type, Score, Factor, Media, Mail.

If testing multiple nodes, run them in parallel.

---

## Phase 3: Present Report

For each node, present results as a structured report:

### Node: {name} ({host})

#### IP Information
| Item | Value |
|------|-------|
| Location | {City.Name}, {Region.Name} |
| ASN | AS{ASN} — {Organization} |
| Type | {Type.Usage values} |
| Timezone | {TimeZone} |

#### Risk Scores
| Provider | Score | Rating |
|----------|-------|--------|
| SCAMALYTICS | {score} | {low/medium/high} |
| AbuseIPDB | {score} | {low/medium/high} |
| IP2LOCATION | {score} | {low/medium/high} |
| IPQS | {score} | {low/medium/high} |

#### Risk Factors (across 9 providers)
| Factor | Flagged By |
|--------|-----------|
| Proxy | {list providers where true, or "None"} |
| VPN | {list providers where true, or "None"} |
| Tor | {list providers where true, or "None"} |
| Server/DC | {list providers where true, or "None"} |
| Abuser | {list providers where true, or "None"} |

#### Streaming Media Unlock
| Service | Status | Region |
|---------|--------|--------|
| Netflix | {Yes/No/Block} | {region} |
| Disney+ | {Yes/No/Block} | {region} |
| ChatGPT | {Yes/No/Block} | {region} |
| YouTube | {Yes/No/Block} | {region} |
| ... | ... | ... |

#### Email & Blacklists
- Port 25: {open/closed}
- DNS Blacklist: {Clean}/{Total} clean ({Blacklisted} blacklisted)

---

## Phase 4: Recommendations

Based on the results, provide actionable recommendations:

- **High risk scores**: "IP has elevated risk scores. Services may flag or block this IP."
- **VPN/Proxy/Tor detected**: "IP is identified as proxy/VPN by {N} providers. Streaming services will likely block it."
- **Server/DC type**: "IP is classified as datacenter. Some services restrict DC IPs."
- **Media blocked**: "The following services are blocked: {list}. Consider a residential IP for streaming."
- **DNS blacklisted**: "IP appears on {N} DNS blacklists. Email delivery will be affected."
- **All clean**: "IP quality is excellent — low risk, no flags."
