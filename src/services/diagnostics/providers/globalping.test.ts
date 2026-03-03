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

describe("globalping provider", () => {
  test("returns ping results on success", async () => {
    // Globalping uses POST to create measurement, then GET to poll results
    let callCount = 0;
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes("/v1/measurements") && callCount === 0) {
        callCount++;
        return new Response(JSON.stringify({ id: "meas-123" }), { status: 202 });
      }
      // Poll result
      return new Response(JSON.stringify({
        status: "finished",
        results: [{
          result: {
            status: "finished",
            stats: { min: 150.1, avg: 168.3, max: 195.2, loss: 0, rcv: 3, drop: 0 },
            timings: [{ rtt: 150.1 }, { rtt: 168.3 }, { rtt: 195.2 }],
          },
          probe: { continent: "AS", country: "CN", city: "Beijing", asn: 4134, network: "ChinaNet" },
        }],
      }));
    }) as typeof fetch;

    const { globalping } = await import("./globalping");
    registerProvider(globalping);
    setSetting(db, "globalping_token", "test_token");

    const result = await runProvider(db, "globalping", {
      ip: "95.181.188.250",
      target: "Beijing, CN",
    });
    expect(result.skipped).toBe(false);
    expect(result.data.latency_avg).toBe(168.3);
    expect(result.data.packet_loss).toBe(0);

    globalThis.fetch = originalFetch;
  });

  test("skips without API token", async () => {
    const { globalping } = await import("./globalping");
    registerProvider(globalping);

    // Without token set, it should be skipped due to settingKey check
    const result = await runProvider(db, "globalping", { ip: "1.1.1.1" });
    expect(result.skipped).toBe(true);

    globalThis.fetch = originalFetch;
  });
});
