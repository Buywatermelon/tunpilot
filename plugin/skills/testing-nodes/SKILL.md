---
name: testing-nodes
description: Use when testing proxy node quality, running diagnostics, or generating a comprehensive node health report.
metadata:
  openclaw:
    emoji: "🔬"
    homepage: https://github.com/Buywatermelon/tunpilot
---

# TunPilot Node Diagnostics

Run comprehensive diagnostics on proxy nodes: IP info, IP quality/purity, connectivity, and route testing. Generates a structured report with actionable recommendations.

**Prerequisite**: TunPilot MCP must be connected. API keys should be configured via `set_setting` tool (use `list_settings` to check which are configured).

---

## Phase 1: Identify Target

Ask the user which node(s) to test. Use `list_nodes` to show available nodes if needed.

Accept:
- A single node name or ID
- "all" to test all enabled nodes

---

## Phase 2: Run Diagnostics (Parallel)

For each target node, call these MCP tools **in parallel**:

1. `check_node_ip` — IP geolocation, ASN, ISP
2. `check_ip_quality` — Scamalytics + IPQS + AbuseIPDB fraud/purity scores
3. `test_node_connectivity` — TCP handshake latency
4. `test_node_route` with `from: "Beijing, CN"` — China route quality
5. `test_node_route` with `from: "Tokyo, JP"` — Japan route quality (optional second location)

---

## Phase 3: Generate Report

Present results as a structured report per node:

### Node: {name} ({host})

#### IP Information
| Item | Value |
|------|-------|
| Location | {city}, {country} |
| ASN | {asn} |
| ISP | {isp} |
| Hosting/DC | {yes/no} |

#### IP Quality
| Check | Result | Rating |
|-------|--------|--------|
| Scamalytics score | {score}/100 | {emoji} {risk_level} |
| IPQS fraud score | {score}/100 | {emoji} |
| AbuseIPDB reports | {count} reports | {emoji} |
| VPN/Proxy detected | {yes/no} | {emoji} |

Rating scale: score 0-30 = low risk, 31-60 = medium risk, 61-100 = high risk.

#### Connectivity
| Check | Result |
|-------|--------|
| TCP handshake | {latency}ms |
| Port reachable | {yes/no} |

#### Route Quality
| From | Latency | Packet Loss |
|------|---------|-------------|
| Beijing, CN | {avg}ms | {loss}% |
| Tokyo, JP | {avg}ms | {loss}% |

Items marked "未配置" indicate the corresponding API key is not set. Use `set_setting` to configure.

---

## Phase 4: Recommendations

Based on the results, provide actionable recommendations:

- **High fraud score (>60)**: "IP may be flagged by services. Consider rotating IP or switching provider."
- **VPN/Proxy detected**: "IP is known as a proxy endpoint. Streaming services may block it."
- **High abuse reports (>10)**: "IP has abuse history. Monitor for potential blacklisting."
- **High latency from China (>300ms)**: "Route quality is poor. Consider a node with CN2/GIA routing."
- **Packet loss >2%**: "Network path is unstable. Check provider's network quality."
- **TCP unreachable**: "Port is not responding. Check firewall rules and service status."

---

## Quick Reference: API Key Setup

| Setting Key | Service | Get Key At |
|-------------|---------|------------|
| ipinfo_token | IPinfo.io | https://ipinfo.io/signup |
| scamalytics_key | Scamalytics | https://scamalytics.com/ip/api |
| ipqs_key | IPQualityScore | https://www.ipqualityscore.com/create-account |
| globalping_token | Globalping | https://globalping.io/auth |
| abuseipdb_key | AbuseIPDB | https://www.abuseipdb.com/register |

Example: `set_setting(key: "ipinfo_token", value: "your_token_here")`

---

## MCP Tools Reference

| Tool | Purpose |
|------|---------|
| `list_settings` | Check which API keys are configured |
| `set_setting` | Configure an API key |
| `check_node_ip` | IP geolocation + ASN (uses ipinfo) |
| `check_ip_quality` | IP purity scores (uses scamalytics + ipqs + abuseipdb) |
| `test_node_connectivity` | TCP handshake latency test |
| `test_node_route` | Route quality from specified location (uses globalping) |
