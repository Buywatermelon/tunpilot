import { test, expect, beforeEach, afterEach, describe, spyOn } from "bun:test";
import { initDatabase, type Db } from "../../db/index";
import { addNode } from "../node";
import * as tunnelModule from "../xray/tunnel";
import { queryHysteriaTraffic } from "./stats";

let db: Db;
let originalFetch: typeof globalThis.fetch;

const mockEnsureTunnel = spyOn(tunnelModule, "ensureTunnel");

beforeEach(() => {
  db = initDatabase(":memory:");
  originalFetch = globalThis.fetch;
  mockEnsureTunnel.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  db?.$client?.close();
});

describe("queryHysteriaTraffic", () => {
  test("带 SSH 配置的节点通过本地隧道拉取 stats", async () => {
    const node = addNode(db, {
      name: "voyra-us",
      host: "hy2.example.com",
      port: 8443,
      protocol: "hysteria2",
      stats_port: 9999,
      stats_secret: "stats-secret",
      ssh_alias: "voyra",
    });

    mockEnsureTunnel.mockResolvedValue(27511);
    globalThis.fetch = (async (url: any, opts: any) => {
      expect(String(url)).toBe("http://127.0.0.1:27511/traffic?clear=1");
      expect((opts?.headers as Record<string, string>)?.Authorization).toBe("stats-secret");
      return new Response(JSON.stringify({ alice: { tx: 1, rx: 2 } }));
    }) as typeof globalThis.fetch;

    const data = await queryHysteriaTraffic(node, true);

    expect(data).toEqual({ alice: { tx: 1, rx: 2 } });
  });

  test("无 SSH 配置时直连节点 stats 地址", async () => {
    const node = addNode(db, {
      name: "bwg-us",
      host: "95.181.188.250",
      port: 443,
      protocol: "hysteria2",
      stats_port: 9999,
      stats_secret: "stats-secret",
    });

    globalThis.fetch = (async (url: any) => {
      expect(String(url)).toBe("http://95.181.188.250:9999/traffic");
      return new Response(JSON.stringify({}));
    }) as typeof globalThis.fetch;

    await queryHysteriaTraffic(node, false);
    expect(mockEnsureTunnel).not.toHaveBeenCalled();
  });
});
