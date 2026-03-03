import { describe, test, expect, beforeEach, mock } from "bun:test";
import { initDatabase, type Db } from "../../../db/index";
import { setSetting } from "../../settings";
import { resetRegistry, registerProvider, runProvider } from "../index";
import { ipinfo } from "./ipinfo";

let db: Db;

beforeEach(() => {
  db = initDatabase(":memory:");
  resetRegistry();
  registerProvider(ipinfo);
});

// Mock fetch for testing
const originalFetch = globalThis.fetch;

describe("ipinfo provider", () => {
  test("returns structured IP info on success", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      ip: "95.181.188.250",
      city: "Los Angeles",
      region: "California",
      country: "US",
      loc: "34.0522,-118.2437",
      org: "AS20473 The Constant Company, LLC",
      timezone: "America/Los_Angeles",
      privacy: { vpn: false, proxy: false, tor: false, relay: false, hosting: true },
    }))) as typeof fetch;

    setSetting(db, "ipinfo_token", "test_token");

    const result = await runProvider(db, "ipinfo", { ip: "95.181.188.250" });
    expect(result.skipped).toBe(false);
    expect(result.data.country).toBe("US");
    expect(result.data.city).toBe("Los Angeles");
    expect(result.data.asn).toBe("AS20473");

    globalThis.fetch = originalFetch;
  });

  test("skips when no API key configured", async () => {
    const result = await runProvider(db, "ipinfo", { ip: "1.1.1.1" });
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain("ipinfo_token");
  });
});
