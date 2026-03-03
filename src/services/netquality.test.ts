import { describe, test, expect, beforeEach } from "bun:test";
import { runNetQuality } from "./netquality";

// Mock Bun.spawn
const originalSpawn = Bun.spawn;

const sampleOutput: object = {
  Head: {
    IP: "1.2.3.4",
    Command: "bash <(curl -sL Net.Check.Place) -j -4 -y",
    GitHub: "https://github.com/xykt/NetQuality",
    Time: "2026-01-15 09:31:25 UTC",
    Version: "v2026-01-15",
  },
  BGP: {
    ASN: "12345",
    Organization: "Test ISP",
    Prefix: "1.2.3.0/24",
    RIR: "ARIN",
    RegDate: "2020-01-01",
    ModDate: "2024-01-01",
    Country: "US",
    IntermediateRegion: "",
    SubRegion: "Northern America",
    Region: "Americas",
    Address: "123 Test St",
    GeoFeed: "",
    IPinTotal: "256",
    IPActive: "200",
    NeighborinTotal: "10",
    NeighborActive: "8",
    IXCount: "5",
    UpstreamsCount: "3",
    PeersCount: "20",
  },
  Local: {
    NAT: "No",
    NATDescribe: "Direct connection",
    Mapping: "Endpoint-Independent Mapping",
    Filter: "Endpoint-Independent Filtering",
    Port: "Preserved",
    Hairpin: "Yes",
    TCPCongestionControl: "bbr",
    QueueDiscipline: "fq",
    TCPReceiveBuffer: "131072",
    TCPSendBuffer: "16384",
  },
  Connectivity: [
    { ID: "1", ASN: "174", Org: "Cogent", IsTarget: true, IsTier1: true, IsUpstream: false },
    { ID: "2", ASN: "3356", Org: "Lumen", IsTarget: false, IsTier1: true, IsUpstream: true },
  ],
  Delay: [
    {
      Code: "US",
      Name: "United States",
      CT: { Average: "10.5ms", "1": "10ms", "2": "11ms" },
      CU: { Average: "12.3ms", "1": "12ms", "2": "13ms" },
      CM: { Average: "15.1ms", "1": "15ms", "2": "16ms" },
    },
  ],
  Speedtest: [
    {
      City: "Los Angeles",
      Provider: "Cloudflare",
      ID: "1234",
      SendSpeed: "500 Mbps",
      SendDelay: "5ms",
      ReceiveSpeed: "800 Mbps",
      ReceiveDelay: "4ms",
    },
  ],
  Transfer: [
    {
      City: "Shanghai",
      SendSpeed: "200 Mbps",
      SendRetransmits: "0",
      ReceiveSpeed: "300 Mbps",
      ReceiveRetransmits: "1",
      Delay: { Average: "150ms", "1": "148ms", "2": "152ms" },
    },
  ],
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
    expect(result.Local.TCPCongestionControl).toBe("bbr");
    expect(result.Connectivity).toHaveLength(2);
    expect(result.Delay[0].CT.Average).toBe("10.5ms");
    expect(result.Speedtest[0].ReceiveSpeed).toBe("800 Mbps");
    expect(result.Transfer[0].City).toBe("Shanghai");
  });

  test("handles progress text before JSON", async () => {
    mockSpawn("Testing network...\nPlease wait...\n" + JSON.stringify(sampleOutput));
    const result = await runNetQuality("1.2.3.4", "root");
    expect(result.Head.IP).toBe("1.2.3.4");
  });

  test("throws on SSH failure", async () => {
    mockSpawn("", 255, "Connection refused");
    await expect(runNetQuality("1.2.3.4", "root")).rejects.toThrow("SSH command failed (exit 255)");
  });

  test("throws on invalid JSON (no JSON at all)", async () => {
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
    const command = capturedArgs[capturedArgs.length - 1];
    expect(command).toContain("Net.Check.Place");
    expect(command).toContain("-j");
    expect(command).toContain("-4");
    expect(command).toContain("-y");
    expect(command).not.toContain("-P");
    expect(command).not.toContain("-L");
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
    const command = capturedArgs[capturedArgs.length - 1];
    expect(command).toContain("Net.Check.Place");
    expect(command).toContain("-P");
    expect(command).toContain("-j");
    expect(command).toContain("-4");
    expect(command).toContain("-y");
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
    const command = capturedArgs[capturedArgs.length - 1];
    expect(command).toContain("Net.Check.Place");
    expect(command).toContain("-L");
    expect(command).toContain("-j");
    expect(command).toContain("-4");
    expect(command).toContain("-y");
  });
});
