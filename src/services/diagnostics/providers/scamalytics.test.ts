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

describe("scamalytics provider", () => {
  test("returns fraud score on success", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      score: "23",
      risk: "low",
      "Anonymizing VPN": "No",
      "Tor Exit Node": "No",
      "Public Proxy": "No",
    }))) as typeof fetch;

    const { scamalytics } = await import("./scamalytics");
    registerProvider(scamalytics);
    setSetting(db, "scamalytics_key", "test_key");

    const result = await runProvider(db, "scamalytics", { ip: "95.181.188.250" });
    expect(result.skipped).toBe(false);
    expect(result.data.score).toBe(23);
    expect(result.data.risk).toBe("low");

    globalThis.fetch = originalFetch;
  });
});
