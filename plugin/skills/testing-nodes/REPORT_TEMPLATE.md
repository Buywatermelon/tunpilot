# Node Diagnostics Report Template

Table templates for rendering IPQuality + NetQuality output. Fill placeholders (`{Head.IP}`, etc.) from the JSON emitted by `tunpilot-diag`.

Pair with [REFERENCE.md](REFERENCE.md) when scoring, classifying, or recommending.

---

## Single Node Report

Present results in two sections: IP Quality first, then Network Quality.

### IP Quality (from IPQuality SSH)

#### IP Information

| Item | Value |
|------|-------|
| IP | {Head.IP} |
| Location | {Info.City.Name}, {Info.City.Subdivisions}, {Info.Region.Name} |
| ASN | AS{Info.ASN} — {Info.Organization} |
| IP Type | {Info.Type} *(see IP Type Guide in REFERENCE.md)* |
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

Interpret using the Classification Guide and Consensus Analysis in REFERENCE.md.

#### Risk Scores

| Database | Score | Rating |
|----------|-------|--------|
| IP2LOCATION | {Score.IP2LOCATION} | {rating} |
| SCAMALYTICS | {Score.SCAMALYTICS} | {rating} |
| ipapi | {Score.ipapi} | {rating} |
| AbuseIPDB | {Score.AbuseIPDB} | {rating} |
| IPQS | {Score.IPQS} | {rating} |
| DBIP | {Score.DBIP} | {rating} |

Rate each score using the Risk Score Interpretation table in REFERENCE.md.

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

Interpret NAT type and TCP congestion control using REFERENCE.md.

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

Rate latency values and analyze per-ISP averages using REFERENCE.md. Present the full 31-province table when user asks for detailed view.

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

---

## Multi-Node Comparison (when testing 2+ nodes)

Present a side-by-side comparison table. Omit rows that do not apply to the data available.

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
