import { describe, it, expect } from "bun:test";
import { commands } from "./sub";
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

describe("sub commands", () => {
  it("sub list (no filter) → GET /subscriptions", async () => {
    const client = mockClient();
    await findCmd("list").run(client, {});
    expect(client.calls[0]).toEqual({ method: "GET", path: "/subscriptions" });
  });

  it("sub list --user=<id> → GET /users/<id>/subscriptions", async () => {
    const client = mockClient();
    await findCmd("list").run(client, { user: "user-123" });
    expect(client.calls[0]).toEqual({ method: "GET", path: "/users/user-123/subscriptions" });
  });

  it("sub create --user=<id> --format=clash → POST /users/<id>/subscriptions", async () => {
    const client = mockClient();
    await findCmd("create").run(client, { user: "user-123", format: "clash" });
    expect(client.calls[0]!.method).toBe("POST");
    expect(client.calls[0]!.path).toBe("/users/user-123/subscriptions");
    expect((client.calls[0]!.body as Record<string, unknown>).format).toBe("clash");
  });

  it("sub delete <id> → DELETE /subscriptions/<id>", async () => {
    const client = mockClient();
    await findCmd("delete").run(client, { id: "sub-456" });
    expect(client.calls[0]).toEqual({ method: "DELETE", path: "/subscriptions/sub-456" });
  });
});
