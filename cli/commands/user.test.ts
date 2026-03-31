import { describe, it, expect } from "bun:test";
import { commands } from "./user";
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

describe("user commands", () => {
  it("user list → GET /users", async () => {
    const client = mockClient();
    await findCmd("list").run(client, {});
    expect(client.calls[0]).toEqual({ method: "GET", path: "/users" });
  });

  it("user create --name --password → POST /users", async () => {
    const client = mockClient();
    await findCmd("create").run(client, { name: "alice", password: "secret" });
    expect(client.calls[0]!.method).toBe("POST");
    expect(client.calls[0]!.path).toBe("/users");
    const body = client.calls[0]!.body as Record<string, unknown>;
    expect(body.name).toBe("alice");
    expect(body.password).toBe("secret");
  });

  it("user create compound with --nodes=all --subscribe=surge", async () => {
    const client = mockClient();
    await findCmd("create").run(client, {
      name: "bob",
      password: "pass",
      nodes: "all",
      subscribe: "surge",
    });
    expect(client.calls[0]!.method).toBe("POST");
    const body = client.calls[0]!.body as Record<string, unknown>;
    expect(body.nodes).toBe("all");
    expect(body.subscribe).toBe("surge");
  });

  it("user create compound with --nodes=id1,id2", async () => {
    const client = mockClient();
    await findCmd("create").run(client, {
      name: "carol",
      password: "pass",
      nodes: "node-1,node-2",
    });
    const body = client.calls[0]!.body as Record<string, unknown>;
    expect(body.nodes).toEqual(["node-1", "node-2"]);
  });

  it("user update <id> --nodes=<id1>,<id2> sends PATCH + PUT /users/:id/nodes", async () => {
    const client = mockClient();
    await findCmd("update").run(client, {
      id: "user-1",
      name: "updated",
      nodes: "node-a,node-b",
    });
    expect(client.calls).toHaveLength(2);
    expect(client.calls[0]!.method).toBe("PATCH");
    expect(client.calls[0]!.path).toBe("/users/user-1");
    expect(client.calls[1]!.method).toBe("PUT");
    expect(client.calls[1]!.path).toBe("/users/user-1/nodes");
    expect((client.calls[1]!.body as Record<string, unknown>).node_ids).toEqual(["node-a", "node-b"]);
  });

  it("user delete <id> → DELETE /users/<id>", async () => {
    const client = mockClient();
    await findCmd("delete").run(client, { id: "user-1" });
    expect(client.calls[0]).toEqual({ method: "DELETE", path: "/users/user-1" });
  });

  it("user reset-traffic <id> → POST /users/<id>/reset-traffic", async () => {
    const client = mockClient();
    await findCmd("reset-traffic").run(client, { id: "user-1" });
    expect(client.calls[0]!.method).toBe("POST");
    expect(client.calls[0]!.path).toBe("/users/user-1/reset-traffic");
  });
});
