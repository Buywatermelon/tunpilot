import { describe, test, expect } from "bun:test";
import { getConfig } from "./config";

describe("config", () => {
  test("uses defaults when env vars not set", () => {
    const saved = { ...process.env };
    delete process.env.TUNPILOT_PORT;
    delete process.env.TUNPILOT_DB_PATH;
    delete process.env.TRAFFIC_SYNC_INTERVAL;
    delete process.env.RECONCILE_INTERVAL;
    delete process.env.TRAFFIC_RETENTION_DAYS;

    const config = getConfig();
    expect(config.port).toBe(3000);
    expect(config.host).toBe("0.0.0.0");
    expect(config.dbPath).toBe("./data/tunpilot.db");
    expect(config.baseUrl).toBe("http://localhost:3000");
    expect(config.trafficSyncInterval).toBe(300_000);
    expect(config.reconcileInterval).toBe(600_000);
    expect(config.retentionDays).toBe(90);

    Object.assign(process.env, saved);
  });

  test("reads from env vars", () => {
    const saved = { ...process.env };
    process.env.TUNPILOT_PORT = "4000";
    process.env.TUNPILOT_HOST = "127.0.0.1";
    process.env.TUNPILOT_DB_PATH = "/tmp/test.db";
    process.env.TUNPILOT_BASE_URL = "https://example.com";
    process.env.TUNPILOT_AUTH_TOKEN = "test-token";
    process.env.TRAFFIC_SYNC_INTERVAL = "60000";
    process.env.RECONCILE_INTERVAL = "120000";
    process.env.TRAFFIC_RETENTION_DAYS = "30";

    const config = getConfig();
    expect(config.port).toBe(4000);
    expect(config.host).toBe("127.0.0.1");
    expect(config.dbPath).toBe("/tmp/test.db");
    expect(config.baseUrl).toBe("https://example.com");
    expect(config.authToken).toBe("test-token");
    expect(config.trafficSyncInterval).toBe(60000);
    expect(config.reconcileInterval).toBe(120_000);
    expect(config.retentionDays).toBe(30);

    Object.assign(process.env, saved);
  });
});
