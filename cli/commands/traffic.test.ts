import { describe, it, expect } from "bun:test";
import { commands } from "./traffic";
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

describe("traffic commands", () => {
  it("traffic (no flags) → GET /traffic", async () => {
    const client = mockClient();
    await commands[0]!.run(client, {});
    expect(client.calls[0]).toEqual({ method: "GET", path: "/traffic" });
  });

  it("traffic --user=<id> → GET /traffic?user_id=<id>", async () => {
    const client = mockClient();
    await commands[0]!.run(client, { user: "user-1" });
    expect(client.calls[0]!.path).toBe("/traffic?user_id=user-1");
  });

  it("traffic --node=<id> → GET /traffic?node_id=<id>", async () => {
    const client = mockClient();
    await commands[0]!.run(client, { node: "node-1" });
    expect(client.calls[0]!.path).toBe("/traffic?node_id=node-1");
  });

  it("traffic --from --to → GET /traffic with date params", async () => {
    const client = mockClient();
    await commands[0]!.run(client, { from: "2024-01-01", to: "2024-01-31" });
    expect(client.calls[0]!.path).toBe("/traffic?from=2024-01-01&to=2024-01-31");
  });

  it("combined flags → all query params present", async () => {
    const client = mockClient();
    await commands[0]!.run(client, {
      user: "user-1",
      node: "node-1",
      from: "2024-01-01",
      to: "2024-01-31",
    });
    const path = client.calls[0]!.path;
    expect(path).toContain("user_id=user-1");
    expect(path).toContain("node_id=node-1");
    expect(path).toContain("from=2024-01-01");
    expect(path).toContain("to=2024-01-31");
  });
});
