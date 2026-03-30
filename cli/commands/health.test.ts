import { describe, it, expect } from "bun:test";
import { commands } from "./health";
import type { ApiClient } from "../client";

function mockClient(): ApiClient & { calls: { method: string; path: string; body?: unknown }[] } {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  return {
    calls,
    get: async (path) => { calls.push({ method: "GET", path }); return {}; },
    post: async (path, body) => { calls.push({ method: "POST", path, body }); return {}; },
    patch: async (path, body) => { calls.push({ method: "PATCH", path, body }); return {}; },
    put: async (path, body) => { calls.push({ method: "PUT", path, body }); return {}; },
    del: async (path) => { calls.push({ method: "DELETE", path }); return {}; },
  };
}

describe("health commands", () => {
  it("health without node-id → GET /health", async () => {
    const client = mockClient();
    await commands[0]!.run(client, {});
    expect(client.calls[0]).toEqual({ method: "GET", path: "/health" });
  });

  it("health with specific node-id → GET /health?node_id=<id>", async () => {
    const client = mockClient();
    await commands[0]!.run(client, { "node-id": "node-789" });
    expect(client.calls[0]).toEqual({ method: "GET", path: "/health?node_id=node-789" });
  });
});
