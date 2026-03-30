import { describe, it, expect } from "bun:test";
import { commands } from "./node";
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

describe("node commands", () => {
  it("node list → GET /nodes", async () => {
    const client = mockClient();
    await findCmd("list").run(client, {});
    expect(client.calls[0]).toEqual({ method: "GET", path: "/nodes" });
  });

  it("node add → POST /nodes with correct body", async () => {
    const client = mockClient();
    await findCmd("add").run(client, {
      name: "test-node",
      host: "1.2.3.4",
      port: "443",
      protocol: "hysteria2",
    });
    expect(client.calls[0]!.method).toBe("POST");
    expect(client.calls[0]!.path).toBe("/nodes");
    expect((client.calls[0]!.body as Record<string, unknown>).port).toBe(443);
  });

  it("node update <id> → PATCH /nodes/<id>", async () => {
    const client = mockClient();
    await findCmd("update").run(client, { id: "abc-123", name: "new-name" });
    expect(client.calls[0]).toEqual({ method: "PATCH", path: "/nodes/abc-123", body: { name: "new-name" } });
  });

  it("node remove <id> → DELETE /nodes/<id>", async () => {
    const client = mockClient();
    await findCmd("remove").run(client, { id: "abc-123" });
    expect(client.calls[0]).toEqual({ method: "DELETE", path: "/nodes/abc-123" });
  });

  it("node sync (no id) → POST /nodes/sync", async () => {
    const client = mockClient();
    await findCmd("sync").run(client, {});
    expect(client.calls[0]!.method).toBe("POST");
    expect(client.calls[0]!.path).toBe("/nodes/sync");
  });

  it("node sync <id> → POST /nodes/<id>/sync", async () => {
    const client = mockClient();
    await findCmd("sync").run(client, { id: "node-456" });
    expect(client.calls[0]!.method).toBe("POST");
    expect(client.calls[0]!.path).toBe("/nodes/node-456/sync");
  });
});
