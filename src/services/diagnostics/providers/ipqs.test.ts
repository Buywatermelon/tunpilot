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

describe("ipqs provider", () => {
  test("returns fraud analysis on success", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      success: true,
      fraud_score: 15,
      vpn: false,
      proxy: false,
      tor: false,
      bot_status: false,
      recent_abuse: false,
      ISP: "The Constant Company",
      connection_type: "Data Center",
      country_code: "US",
    }))) as typeof fetch;

    const { ipqs } = await import("./ipqs");
    registerProvider(ipqs);
    setSetting(db, "ipqs_key", "test_key");

    const result = await runProvider(db, "ipqs", { ip: "95.181.188.250" });
    expect(result.skipped).toBe(false);
    expect(result.data.fraud_score).toBe(15);
    expect(result.data.vpn).toBe(false);
    expect(result.data.connection_type).toBe("Data Center");

    globalThis.fetch = originalFetch;
  });
});
