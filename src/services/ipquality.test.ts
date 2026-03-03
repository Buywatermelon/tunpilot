import { describe, test, expect, beforeEach } from "bun:test";
import { runIPQuality } from "./ipquality";

// Mock Bun.spawn
const originalSpawn = Bun.spawn;

const sampleOutput: object = {
  Head: { IP: "1.2.3.4", Time: "2026-01-15 09:31:25 UTC", Version: "v2026-01-15" },
  Info: {
    ASN: "12345",
    Organization: "Test ISP",
    City: { Name: "Tokyo", Subdivisions: "Tokyo" },
    Region: { Code: "JP", Name: "Japan" },
    Continent: { Code: "AS", Name: "Asia" },
    TimeZone: "Asia/Tokyo",
  },
  Type: { Usage: { IPinfo: "ISP" }, Company: { IPinfo: "ISP" } },
  Score: { SCAMALYTICS: "0", AbuseIPDB: "0" },
  Factor: {
    Proxy: { IPinfo: false },
    VPN: { IPinfo: false },
    Tor: { IPinfo: false },
  },
  Media: {
    Netflix: { Status: "Yes", Region: "JP", Type: "Native" },
    ChatGPT: { Status: "Yes", Region: "JP", Type: "Native" },
  },
  Mail: {
    Port25: false,
    DNSBlacklist: { Total: 439, Clean: 430, Marked: 9, Blacklisted: 0 },
  },
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

describe("runIPQuality", () => {
  test("parses valid JSON output", async () => {
    mockSpawn(JSON.stringify(sampleOutput));
    const result = await runIPQuality("1.2.3.4", "root", 22);
    expect(result.Head.IP).toBe("1.2.3.4");
    expect(result.Info.ASN).toBe("12345");
    expect(result.Score.SCAMALYTICS).toBe("0");
    expect(result.Media.Netflix!.Status).toBe("Yes");
  });

  test("handles progress text before JSON", async () => {
    mockSpawn("Checking IP...\nPlease wait...\n" + JSON.stringify(sampleOutput));
    const result = await runIPQuality("1.2.3.4", "root");
    expect(result.Head.IP).toBe("1.2.3.4");
  });

  test("throws on SSH failure", async () => {
    mockSpawn("", 255, "Connection refused");
    await expect(runIPQuality("1.2.3.4", "root")).rejects.toThrow("SSH command failed (exit 255)");
  });

  test("throws on invalid JSON", async () => {
    mockSpawn("not json at all");
    await expect(runIPQuality("1.2.3.4", "root")).rejects.toThrow("No JSON found");
  });

  test("throws on malformed JSON", async () => {
    mockSpawn("{invalid json}}}");
    await expect(runIPQuality("1.2.3.4", "root")).rejects.toThrow("Failed to parse IPQuality JSON");
  });
});
