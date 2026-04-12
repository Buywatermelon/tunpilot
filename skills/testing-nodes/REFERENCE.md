# Node Diagnostics Reference

Interpretation guides, classification tables, and analysis patterns for IP quality and network quality reports.

---

## IP Quality Interpretation

### Usage Classification Guide

| Chinese Label | English | Meaning | Quality Impact |
|---------------|---------|---------|----------------|
| 家宽 | Residential | ISP consumer line | Best — lowest detection risk, ideal for streaming and general use |
| 商业 | Business | Commercial/enterprise line | Good — some services may have minor restrictions |
| 机房 | Datacenter/Hosting | Server/cloud provider | Poor — most IP databases flag datacenter IPs, streaming services likely restrict |
| 教育 | Education | University/school network | Variable — depends on specific institution |

### IP Type Guide

| Chinese Label | English | Meaning |
|---------------|---------|---------|
| 原生IP | Native IP | IP registered to the local ISP in the server's country. Best for geo-restricted services |
| 广播IP | Broadcast/Anycast IP | IP announced via BGP from a different region than registration. May trigger geo-mismatch flags |

### Consensus Analysis

- All 5 agree → high confidence classification
- 4/5 agree → strong classification, 1 outlier is likely noise
- Mixed results → borderline IP, classification may be disputed by some services

### Risk Score Interpretation

| Database | Low Risk | Medium Risk | High Risk | Notes |
|----------|----------|-------------|-----------|-------|
| IP2LOCATION | 0-20 | 20-80 | 80-100 | Proxy score. Datacenter IPs often score 99 regardless of actual abuse |
| SCAMALYTICS | 0-20 | 20-50 | 50+ | Fraud score. Very sensitive to datacenter classification |
| ipapi | <1% | 1-10% | 10%+ | Threat percentage. Most clean IPs show <1% |
| AbuseIPDB | 0-10 | 10-50 | 50+ | Confidence of abuse. Based on user reports |
| IPQS | 0-30 | 30-75 | 75+ | Fraud score. "null" means API unreachable, not a risk indicator |
| DBIP | 0 | — | 1+ | Binary. 0 = clean, any positive value = flagged |

### Detection Pattern Analysis

| Detection Count | Assessment | Impact |
|----------------|------------|--------|
| 0/9 flagged | Clean IP, excellent quality | No restrictions expected |
| 1-2/9 flagged | Borderline, likely false positive | Usually fine, most services won't block |
| 3-5/9 flagged | Moderate risk | Some services will flag or restrict, streaming may be limited |
| 6+/9 flagged | High risk | Most services will detect and restrict this IP |

### Streaming Status Meanings

- 解锁 + 原生 = native unlock, best quality — service directly available from this IP
- 解锁 + DNS = DNS-based unlock — works but may change if DNS detection improves
- 失败 = blocked — service actively rejects this IP

---

## Network Quality Interpretation

### NAT Type Impact

| NAT Type | Chinese | Impact |
|----------|---------|--------|
| Full Cone | 全锥形 | Best — ideal for P2P, gaming, and VoIP |
| Restricted Cone | 受限锥形 | Good — works for most applications |
| Port Restricted Cone | 端口受限锥形 | OK — some P2P may have issues |
| Symmetric | 对称型 | Worst — problematic for P2P and gaming, NAT traversal difficult |

### TCP Congestion Control

| Algorithm | Notes |
|-----------|-------|
| `bbr` | Recommended for proxy servers — best throughput on lossy/long-distance links |
| `cubic` | Linux default — adequate but suboptimal for high-latency proxy use |
| `hybla` | Designed for high-latency satellite links — good alternative for long-distance |

### Latency Rating

| Range | Rating | User Experience |
|-------|--------|-----------------|
| <50ms | Excellent | Imperceptible delay |
| 50-100ms | Good | Smooth browsing and video |
| 100-200ms | Fair | Noticeable on interactive apps |
| 200-500ms | Poor | Laggy, affects real-time use |
| >500ms / 0 | Timeout | Route broken or severely congested |

### Speed Rating

| Speed | Rating |
|-------|--------|
| >50 Mbps | Excellent |
| 10-50 Mbps | Good |
| 1-10 Mbps | Fair |
| <1 Mbps | Poor |

### Retransmit Analysis

High retransmit counts (>10000) indicate a congested or lossy path. This often points to throttling by intermediate ISPs or overloaded peering points.

### Latency Analysis Notes

- Calculate per-ISP national average across all provinces
- Identify which ISP has the best (lowest) average latency
- Flag provinces where Average = "0" — this means timeout (route broken), not 0ms latency
- Flag provinces with anomalously high values (>3x the national average for that ISP)
- CT = China Telecom, CU = China Unicom, CM = China Mobile

---

## IP Quality Patterns

Identify which pattern(s) apply to each node and explain accordingly:

**Pattern: Premium Residential**
- Usage: all providers say "residential"; IP type: native; Detection: 0/9; Risk scores: all low
- Recommendation: "Excellent IP quality. Residential native IP with zero detection flags. Ideal for all use cases including streaming and sensitive services."

**Pattern: Standard Datacenter**
- Usage: most say "datacenter/hosting"; Detection: VPN/Proxy 3+/9, Server 4+/9; IP2LOCATION 80+
- Recommendation: "Typical datacenter IP. High IP2LOCATION score is expected for datacenter IPs — it's a classification score, not a threat score. Streaming services that check IP type may block, while YouTube/ChatGPT typically allow."

**Pattern: High-Quality Datacenter**
- Usage: datacenter but low detection flags (0-2/9); Risk scores mostly low
- Recommendation: "Above-average datacenter IP. Despite datacenter classification, detection flags are minimal. Most services should work, though some streaming platforms may still restrict based on IP type."

**Pattern: Compromised or Abused IP**
- Detection: Abuser 3+/9; AbuseIPDB 50+; DNS blacklist count > 0
- Recommendation: "This IP shows signs of prior abuse. Email delivery will be unreliable. Consider requesting a new IP from the provider."

**Pattern: Port 25 Blocked (Common for Cloud)**
- Port 25: closed, all mail providers unreachable
- Recommendation: "Port 25 (SMTP) is blocked by the hosting provider — standard for cloud/VPS. Does not affect proxy usage."

## Network Quality Patterns

**Pattern: Premium Network**
- Low latency all ISPs (<100ms avg), BBR, Full Cone/no NAT, international >50 Mbps
- Recommendation: "Excellent network quality. Low latency, BBR congestion control, and strong international throughput."

**Pattern: CT-Optimized (CN2/CN2 GIA)**
- CT latency significantly lower than CU/CM (e.g., CT <80ms while CU/CM >150ms)
- Recommendation: "Premium China Telecom routing (likely CN2/CN2 GIA). CT users get best experience. CU/CM users may see higher latency."

**Pattern: CU-Optimized (AS9929/AS4837)**
- CU latency lowest among the three ISPs
- Recommendation: "Optimized China Unicom routing (likely AS9929/AS4837). Consider pairing with a CT-optimized node for full coverage."

**Pattern: CM-Optimized (CMIN2/CMI)**
- CM latency lowest among the three ISPs
- Recommendation: "Optimized China Mobile routing (likely CMIN2/CMI). Good choice for CM-heavy user bases."

**Pattern: Poor Routing**
- High latency with many timeout provinces; High TCP retransmits (>10000)
- Recommendation: "Routing issues detected. Consider switching to a provider with better China connectivity."

## Multi-Node Recommendation

When comparing multiple nodes, explicitly state:
- Which node has better overall IP quality and why
- Which node is better for specific use cases (streaming, general browsing, ChatGPT)
- Notable differences (e.g., "Node A unlocks TikTok but B doesn't")
- Which node has better network performance for each ISP (CT/CU/CM)
- Optimal node assignment per user based on their ISP
