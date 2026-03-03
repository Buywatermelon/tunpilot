# NetQuality Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate xykt/NetQuality as a second diagnostic dimension alongside IPQuality, providing network performance testing (latency, speed, BGP, routing) for proxy nodes.

**Architecture:** Same SSH-based integration pattern as IPQuality — new service runner (`netquality.ts`), new MCP tool (`test_node_netquality`), updated skill orchestration. MCP provides the atomic tool, skill handles report presentation.

**Tech Stack:** Bun, Hono, MCP SDK, Zod, bun:test

---

### Task 1: Create NetQuality Service Runner

**Files:**
- Create: `src/services/netquality.ts`
- Create: `src/services/netquality.test.ts`

**Step 1: Write the failing tests**

Create `src/services/netquality.test.ts` mirroring the ipquality.test.ts pattern:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { runNetQuality } from "./netquality";

const originalSpawn = Bun.spawn;

const sampleOutput: object = {
  Head: { IP: "1.2.3.4", Command: "bash <(curl -sL Net.Check.Place) -j -4 -y", GitHub: "https://github.com/xykt/NetQuality", Time: "2026-01-15 17:47:38 CST", Version: "v2025-01-11" },
  BGP: { ASN: "12345", Organization: "Test ISP", Prefix: 24, RIR: "ARIN", RegDate: "2020-01-01", ModDate: "2024-01-01", Country: "United States", IntermediateRegion: "null", SubRegion: "null", Region: "null", Address: "123 Test St", GeoFeed: "null", IPinTotal: 256, IPActive: 100, NeighborinTotal: 10, NeighborActive: 5, IXCount: 2, UpstreamsCount: 3, PeersCount: 15 },
  Local: { NAT: "0x000013", NATDescribe: "Full Cone", Mapping: "Independent", Filter: "Endpoint Independent", Port: "Preserved", Hairpin: "Not Supported", TCPCongestionControl: "bbr", QueueDiscipline: "fq", TCPReceiveBuffer: "4096 131072 33554432", TCPSendBuffer: "4096 16384 33554432" },
  Connectivity: [{ ID: 1, ASN: 12345, Org: "Test ISP", IsTarget: true, IsTier1: false, IsUpstream: false }],
  Delay: [{ Code: "BJ", Name: "京", CT: { Average: "65", "1": "66.64" }, CU: { Average: "71", "1": "70.96" }, CM: { Average: "86", "1": "87.31" } }],
  Speedtest: [{ City: "苏州", Provider: "电信", ID: "5396", SendSpeed: "63680992", SendDelay: "96", ReceiveSpeed: "62866008", ReceiveDelay: "172" }],
  Transfer: [{ City: "香港", SendSpeed: "67699248.54", SendRetransmits: "7542", ReceiveSpeed: "48583341.17", ReceiveRetransmits: "773", Delay: { Average: "55", "1": "55.36" } }],
};

function mockSpawn(stdout: string, exitCode: number = 0, stderr: string = "") {
  Bun.spawn = (() => ({
    stdout: new Response(stdout).body!,
    stderr: new Response(stderr).body!,
    exited: Promise.resolve(exitCode),
    kill: () => {},
  })) as unknown as typeof Bun.spawn;
}

beforeEach(() => {
  Bun.spawn = originalSpawn;
});

describe("runNetQuality", () => {
  test("parses valid JSON output", async () => {
    mockSpawn(JSON.stringify(sampleOutput));
    const result = await runNetQuality("1.2.3.4", "root", 22);
    expect(result.Head.IP).toBe("1.2.3.4");
    expect(result.BGP.ASN).toBe("12345");
    expect(result.Delay[0].Code).toBe("BJ");
    expect(result.Transfer[0].City).toBe("香港");
  });

  test("handles progress text before JSON", async () => {
    mockSpawn("Checking network...\nPlease wait...\n" + JSON.stringify(sampleOutput));
    const result = await runNetQuality("1.2.3.4", "root");
    expect(result.Head.IP).toBe("1.2.3.4");
  });

  test("throws on SSH failure", async () => {
    mockSpawn("", 255, "Connection refused");
    await expect(runNetQuality("1.2.3.4", "root")).rejects.toThrow("SSH command failed (exit 255)");
  });

  test("throws on invalid JSON", async () => {
    mockSpawn("not json at all");
    await expect(runNetQuality("1.2.3.4", "root")).rejects.toThrow("No JSON found");
  });

  test("throws on malformed JSON", async () => {
    mockSpawn("{invalid json}}}");
    await expect(runNetQuality("1.2.3.4", "root")).rejects.toThrow("Failed to parse NetQuality JSON");
  });

  test("does not override StrictHostKeyChecking", async () => {
    let capturedArgs: string[] = [];
    Bun.spawn = ((args: string[]) => {
      capturedArgs = args;
      return {
        stdout: new Response(JSON.stringify(sampleOutput)).body!,
        stderr: new Response("").body!,
        exited: Promise.resolve(0),
        kill: () => {},
      };
    }) as unknown as typeof Bun.spawn;
    await runNetQuality("1.2.3.4", "root", 22);
    expect(capturedArgs.join(" ")).not.toContain("StrictHostKeyChecking");
    expect(capturedArgs.join(" ")).toContain("ConnectTimeout");
  });

  test("uses correct command for full mode", async () => {
    let capturedArgs: string[] = [];
    Bun.spawn = ((args: string[]) => {
      capturedArgs = args;
      return {
        stdout: new Response(JSON.stringify(sampleOutput)).body!,
        stderr: new Response("").body!,
        exited: Promise.resolve(0),
        kill: () => {},
      };
    }) as unknown as typeof Bun.spawn;
    await runNetQuality("1.2.3.4", "root", 22, "full");
    expect(capturedArgs.join(" ")).toContain("Net.Check.Place");
    expect(capturedArgs.join(" ")).toContain("-j -4 -y");
  });

  test("uses -P flag for ping mode", async () => {
    let capturedArgs: string[] = [];
    Bun.spawn = ((args: string[]) => {
      capturedArgs = args;
      return {
        stdout: new Response(JSON.stringify(sampleOutput)).body!,
        stderr: new Response("").body!,
        exited: Promise.resolve(0),
        kill: () => {},
      };
    }) as unknown as typeof Bun.spawn;
    await runNetQuality("1.2.3.4", "root", 22, "ping");
    expect(capturedArgs.join(" ")).toContain("-P");
  });

  test("uses -L flag for low mode", async () => {
    let capturedArgs: string[] = [];
    Bun.spawn = ((args: string[]) => {
      capturedArgs = args;
      return {
        stdout: new Response(JSON.stringify(sampleOutput)).body!,
        stderr: new Response("").body!,
        exited: Promise.resolve(0),
        kill: () => {},
      };
    }) as unknown as typeof Bun.spawn;
    await runNetQuality("1.2.3.4", "root", 22, "low");
    expect(capturedArgs.join(" ")).toContain("-L");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test src/services/netquality.test.ts`
Expected: FAIL — module `./netquality` not found

**Step 3: Write the implementation**

Create `src/services/netquality.ts`:

```typescript
export type NetQualityMode = "full" | "ping" | "low";

export interface DelayMeasurement {
  Average: string;
  [sample: string]: string;
}

export interface NetQualityResult {
  Head: {
    IP: string;
    Command: string;
    GitHub: string;
    Time: string;
    Version: string;
  };
  BGP: {
    ASN: string;
    Organization: string;
    Prefix: number;
    RIR: string;
    RegDate: string;
    ModDate: string;
    Country: string;
    IntermediateRegion: string;
    SubRegion: string;
    Region: string;
    Address: string;
    GeoFeed: string;
    IPinTotal: number;
    IPActive: number;
    NeighborinTotal: number;
    NeighborActive: number;
    IXCount: number;
    UpstreamsCount: number;
    PeersCount: number;
  };
  Local: {
    NAT: string;
    NATDescribe: string;
    Mapping: string;
    Filter: string;
    Port: string;
    Hairpin: string;
    TCPCongestionControl: string;
    QueueDiscipline: string;
    TCPReceiveBuffer: string;
    TCPSendBuffer: string;
  };
  Connectivity: Array<{
    ID: number;
    ASN: number;
    Org: string;
    IsTarget: boolean;
    IsTier1: boolean;
    IsUpstream: boolean;
  }>;
  Delay: Array<{
    Code: string;
    Name: string;
    CT: DelayMeasurement;
    CU: DelayMeasurement;
    CM: DelayMeasurement;
  }>;
  Speedtest: Array<{
    City: string;
    Provider: string;
    ID: string;
    SendSpeed: string;
    SendDelay: string;
    ReceiveSpeed: string;
    ReceiveDelay: string;
  }>;
  Transfer: Array<{
    City: string;
    SendSpeed: string;
    SendRetransmits: string;
    ReceiveSpeed: string;
    ReceiveRetransmits: string;
    Delay: DelayMeasurement;
  }>;
}

const MODE_FLAGS: Record<NetQualityMode, string[]> = {
  full: ["-j", "-4", "-y"],
  ping: ["-j", "-4", "-y", "-P"],
  low: ["-j", "-4", "-y", "-L"],
};

const TIMEOUTS: Record<NetQualityMode, number> = {
  full: 600_000,  // 10 minutes
  ping: 120_000,  // 2 minutes
  low: 300_000,   // 5 minutes
};

export async function runNetQuality(
  host: string,
  sshUser: string,
  sshPort: number = 22,
  mode: NetQualityMode = "full",
): Promise<NetQualityResult> {
  const flags = MODE_FLAGS[mode].join(" ");
  const proc = Bun.spawn(
    ["ssh", "-p", String(sshPort), "-o", "ConnectTimeout=10", `${sshUser}@${host}`, `bash <(curl -sL Net.Check.Place) ${flags}`],
    { stdout: "pipe", stderr: "pipe" },
  );

  const timeout = setTimeout(() => proc.kill(), TIMEOUTS[mode]);

  try {
    const exitCode = await proc.exited;
    clearTimeout(timeout);

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    if (exitCode !== 0) {
      throw new Error(`SSH command failed (exit ${exitCode}): ${stderr.slice(0, 500)}`);
    }

    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) {
      throw new Error(`No JSON found in output: ${stdout.slice(0, 500)}`);
    }

    const jsonStr = stdout.slice(jsonStart);
    return JSON.parse(jsonStr) as NetQualityResult;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof SyntaxError) {
      throw new Error(`Failed to parse NetQuality JSON output: ${err.message}`);
    }
    throw err;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test src/services/netquality.test.ts`
Expected: All 8 tests PASS

**Step 5: Commit**

```bash
git add src/services/netquality.ts src/services/netquality.test.ts
git commit -m "feat: add NetQuality SSH runner service"
```

---

### Task 2: Register MCP Tool

**Files:**
- Modify: `src/mcp/tools/diagnostics.ts`

**Step 1: Write a test (manual verification)**

Since MCP tools are integration-tested via the tool registration, verify by checking existing test patterns. The primary test is that the tool registers without errors and the service layer is already tested in Task 1.

**Step 2: Update diagnostics.ts**

Add the `test_node_netquality` tool registration alongside the existing `test_node_ipquality`:

```typescript
// At top: add imports
import { runNetQuality, type NetQualityMode } from "../../services/netquality";

// Update comment
// 注册诊断工具（2 个）：test_node_ipquality, test_node_netquality

// After the existing test_node_ipquality registration, add:
server.registerTool(
  "test_node_netquality",
  {
    description:
      "Run comprehensive network quality test on a node via SSH. Tests BGP info, NAT type, Tier-1 connectivity, three-network TCP latency (31 provinces × CT/CU/CM), domestic speedtest, and international interconnection (10 global cities). Requires ssh_user configured. Full mode takes 3-5 min.",
    inputSchema: {
      node_id: z.string().describe("Node ID to test"),
      mode: z.enum(["full", "ping", "low"]).default("full").describe("Test mode: full (all 7 modules, 3-5 min), ping (latency only, ~30s), low (skip speedtest)"),
    },
  },
  async ({ node_id, mode }) => {
    const node = getNode(db, node_id);
    if (!node) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Node not found" }) }],
      };
    }

    if (!node.ssh_user) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: "Node does not have ssh_user configured. Update the node with ssh_user to use this tool.",
            }),
          },
        ],
      };
    }

    try {
      const result = await runNetQuality(node.host, node.ssh_user, node.ssh_port ?? 22, mode as NetQualityMode);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ node_id, node_name: node.name, host: node.host, mode, ...result }),
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: `NetQuality check failed: ${err instanceof Error ? err.message : String(err)}`,
            }),
          },
        ],
      };
    }
  },
);
```

**Step 3: Run all tests**

Run: `bun test`
Expected: All tests pass (existing + new)

**Step 4: Commit**

```bash
git add src/mcp/tools/diagnostics.ts
git commit -m "feat: register test_node_netquality MCP tool"
```

---

### Task 3: Update deploying-nodes Skill

**Files:**
- Modify: `skills/deploying-nodes/SKILL.md`

**Step 1: Update Phase 2.3 dependency install command**

Change:
```bash
ssh <server> "apt-get update -qq && apt-get install -y -qq jq curl bc netcat-openbsd dnsutils iproute2"
```

To:
```bash
ssh <server> "apt-get update -qq && apt-get install -y -qq jq curl bc netcat-openbsd dnsutils iproute2 iperf3 mtr"
```

Update the description text to mention both IPQuality and NetQuality.

**Step 2: Update MCP Tools Reference**

Add `test_node_netquality` to the reference table at the bottom.

**Step 3: Commit**

```bash
git add skills/deploying-nodes/SKILL.md
git commit -m "docs: add NetQuality deps to deploying-nodes skill"
```

---

### Task 4: Update testing-nodes Skill

**Files:**
- Modify: `skills/testing-nodes/SKILL.md`

This is the highest-value task — the skill orchestration that presents the combined report.

**Step 1: Update the skill description and intro**

Change the intro to describe dual-dimension diagnostics (IP quality + network quality).

**Step 2: Update Phase 2 to run both tools**

Add `test_node_netquality(node_id)` alongside `test_node_ipquality(node_id)`. Both can run in parallel since they're independent tools hitting the same node via SSH... actually they should run sequentially since they both SSH to the same node and the network tests would interfere with each other.

**Step 3: Add Network Quality report sections after existing IP Quality sections**

Add these new sections to Phase 3 report template:

#### BGP Information
| Item | Value |
|------|-------|
| ASN | AS{BGP.ASN} — {BGP.Organization} |
| Prefix | /{BGP.Prefix} ({BGP.IPinTotal} IPs, {BGP.IPActive} active) |
| RIR | {BGP.RIR} |
| Country | {BGP.Country} |
| Upstreams | {BGP.UpstreamsCount} |
| Peers | {BGP.PeersCount} |
| IX Count | {BGP.IXCount} |

#### Local Network Policy
| Item | Value |
|------|-------|
| NAT Type | {Local.NATDescribe} ({Local.NAT}) |
| Mapping | {Local.Mapping} |
| Filter | {Local.Filter} |
| TCP Congestion | {Local.TCPCongestionControl} |
| Queue Discipline | {Local.QueueDiscipline} |

**NAT Type Guide:**
- 全锥形 (Full Cone) — Best for P2P and gaming, all external hosts can reach internal host
- 受限锥形 (Restricted Cone) — Good, external host must first be contacted
- 端口受限锥形 (Port Restricted Cone) — OK, both IP and port must match
- 对称型 (Symmetric) — Worst for P2P, different mapping for each destination

**TCP Congestion Guide:**
- `bbr` — Google BBR, recommended for proxy use, good throughput
- `cubic` — Linux default, fair but not optimized for long-distance
- `hybla` — Good for high-latency satellite links

#### Tier-1 Connectivity
| ASN | Organization | Tier-1 | Upstream | Reachable |
|-----|-------------|--------|----------|-----------|
(List all entries from Connectivity array, highlight IsUpstream=true)

**Interpretation:**
- More Tier-1 upstreams = better international connectivity
- Direct peering (IsUpstream=true) = lower latency than transit

#### Three-Network Latency (31 Provinces)

Present key regions first (user-facing areas), then full table:

**Key Regions Summary:**

| Region | CT (电信) | CU (联通) | CM (移动) |
|--------|----------|----------|----------|
| 北京 (BJ) | {avg}ms | {avg}ms | {avg}ms |
| 上海 (SH) | {avg}ms | {avg}ms | {avg}ms |
| 广东 (GD) | {avg}ms | {avg}ms | {avg}ms |
| 浙江 (ZJ) | {avg}ms | {avg}ms | {avg}ms |
| 江苏 (JS) | {avg}ms | {avg}ms | {avg}ms |
| 四川 (SC) | {avg}ms | {avg}ms | {avg}ms |

**Latency Rating:**
| Range | Rating | User Experience |
|-------|--------|----------------|
| <50ms | Excellent | Imperceptible, like local |
| 50-100ms | Good | Smooth browsing and streaming |
| 100-200ms | Fair | Noticeable on interactive apps |
| 200-500ms | Poor | Laggy, video buffering likely |
| >500ms / 0 | Timeout | Route broken or heavily congested |

**Full 31-Province Table** (expandable, present if user asks or for detailed analysis):
| Province | CT | CU | CM |
|----------|----|----|----|
(all 31 entries)

**Three-Network Analysis:**
- Calculate per-ISP national average from all provinces
- Identify best ISP for this node (lowest average)
- Flag provinces with anomalous latency (>3x the average for that ISP)
- Note: Average=0 means route timeout (packet loss), not 0ms latency

#### Domestic Speed Test
| City | Provider | Upload | Download | Upload Latency | Download Latency |
|------|----------|--------|----------|---------------|-----------------|
(Convert bytes/s to Mbps: value / 1024 / 1024 * 8)

#### International Interconnection
| City | Upload | Download | Send Retransmits | Recv Retransmits | Latency |
|------|--------|----------|-----------------|-----------------|---------|
(Convert bytes/s to Mbps, present top cities)

**International Rating:**
- Speed > 50 Mbps = excellent
- Speed 10-50 Mbps = good
- Speed 1-10 Mbps = fair
- Speed < 1 Mbps = poor
- High retransmits (>10000) = congested path

**Step 4: Update multi-node comparison**

Add network quality metrics to the comparison table:
- Best ISP (CT/CU/CM)
- National average latency per ISP
- International speed (to key cities like Hong Kong, Tokyo, LA)

**Step 5: Update Phase 4 analysis patterns**

Add network-specific patterns:
- **Pattern: Premium Network** — low latency all ISPs, BBR congestion, Full Cone NAT, high international speed
- **Pattern: CT-Optimized** — CT latency much lower than CU/CM (likely CN2/CN2 GIA)
- **Pattern: CU-Optimized** — CU best (likely AS9929/AS4837)
- **Pattern: CM-Optimized** — CM best (likely CMIN2/CMI)
- **Pattern: Poor Routing** — high latency with many timeout provinces, high retransmits

**Step 6: Update troubleshooting**

Add NetQuality-specific errors:
- Script timeout (10 min) — complete mode too slow
- iperf3 connection refused — iperf3 server not available
- speedtest not found — speedtest binary missing

**Step 7: Update MCP Tools Reference**

Add `test_node_netquality` to the table.

**Step 8: Commit**

```bash
git add skills/testing-nodes/SKILL.md
git commit -m "docs: add NetQuality network quality report to testing-nodes skill"
```

---

### Task 5: Update getting-started Skill

**Files:**
- Modify: `skills/getting-started/SKILL.md`

**Step 1: Update tool counts**

Change "21 MCP tools across 6 categories" to "22 MCP tools across 6 categories".
Update Diagnostics count from (1) to (2).

**Step 2: Commit**

```bash
git add skills/getting-started/SKILL.md
git commit -m "docs: update tool count in getting-started skill"
```

---

### Task 6: Sync Skills to Plugin Directory

**Files:**
- Copy: `skills/testing-nodes/SKILL.md` → `plugin/skills/testing-nodes/SKILL.md`
- Copy: `skills/deploying-nodes/SKILL.md` → `plugin/skills/deploying-nodes/SKILL.md`
- Copy: `skills/getting-started/SKILL.md` → `plugin/skills/getting-started/SKILL.md`

**Step 1: Copy files**

```bash
cp skills/testing-nodes/SKILL.md plugin/skills/testing-nodes/SKILL.md
cp skills/deploying-nodes/SKILL.md plugin/skills/deploying-nodes/SKILL.md
cp skills/getting-started/SKILL.md plugin/skills/getting-started/SKILL.md
```

**Step 2: Run all tests one final time**

Run: `bun test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add plugin/skills/
git commit -m "chore: sync updated skills to plugin directory"
```
