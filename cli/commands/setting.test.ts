import { describe, it, expect } from "bun:test";
import { commands } from "./setting";
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

function findCmd(name: string) {
  const cmd = commands.find((c) => c.name === name);
  if (!cmd) throw new Error(`Command not found: ${name}`);
  return cmd;
}

describe("setting commands", () => {
  it("setting list → GET /settings", async () => {
    const client = mockClient();
    await findCmd("list").run(client, {});
    expect(client.calls[0]).toEqual({ method: "GET", path: "/settings" });
  });

  it("setting set <key> <value> → PUT /settings/<key>", async () => {
    const client = mockClient();
    await findCmd("set").run(client, { key: "api_key", value: "secret" });
    expect(client.calls[0]!.method).toBe("PUT");
    expect(client.calls[0]!.path).toBe("/settings/api_key");
    expect((client.calls[0]!.body as Record<string, unknown>).value).toBe("secret");
  });

  it("setting set <key> without value → DELETE /settings/<key>", async () => {
    const client = mockClient();
    await findCmd("set").run(client, { key: "api_key" });
    expect(client.calls[0]!.method).toBe("DELETE");
    expect(client.calls[0]!.path).toBe("/settings/api_key");
  });
});
