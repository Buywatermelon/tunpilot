import { describe, test, expect, beforeEach, mock } from "bun:test";
import { initDatabase, type Db } from "../../../db/index";
import { setSetting } from "../../settings";
import { resetRegistry, registerProvider, runProvider } from "../index";

let db: Db;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  db = initDatabase(":memory:");
  resetRegistry();
});

describe("abuseipdb provider", () => {
  test("returns abuse confidence score on success", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      data: {
        abuseConfidenceScore: 5,
        totalReports: 2,
        lastReportedAt: "2026-02-15T10:00:00Z",
        usageType: "Data Center/Web Hosting/Transit",
        isp: "The Constant Company",
        countryCode: "US",
      },
    }))) as typeof fetch;

    const { abuseipdb } = await import("./abuseipdb");
    registerProvider(abuseipdb);
    setSetting(db, "abuseipdb_key", "test_key");

    const result = await runProvider(db, "abuseipdb", { ip: "95.181.188.250" });
    expect(result.skipped).toBe(false);
    expect(result.data.abuse_confidence).toBe(5);
    expect(result.data.total_reports).toBe(2);
    expect(result.data.usage_type).toBe("Data Center/Web Hosting/Transit");

    globalThis.fetch = originalFetch;
  });
});
