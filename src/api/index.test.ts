import { test, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { initDatabase, type Db } from "../db/index";
import { createApiApp } from "../api/index";
import { addNode } from "../services/node";
import { createUser } from "../services/user";

const BASE_URL = "https://tunpilot.example.com";
const AUTH_TOKEN = "test-secret-token";

let db: Db;
let rootApp: Hono;

beforeEach(() => {
  process.env.TUNPILOT_AUTH_TOKEN = AUTH_TOKEN;
  db = initDatabase(":memory:");
  rootApp = new Hono();
  rootApp.route("/api/v1", createApiApp(db, BASE_URL));
});

afterEach(() => {
  db.$client.close();
  delete process.env.TUNPILOT_AUTH_TOKEN;
});

function req(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${AUTH_TOKEN}`);
  }
  return rootApp.fetch(new Request(`http://localhost${path}`, { ...init, headers }));
}

// --- AC-15 ---
test("unauthenticated request returns 401", async () => {
  const res = await rootApp.fetch(
    new Request("http://localhost/api/v1/nodes", {
      headers: {},
    })
  );
  expect(res.status).toBe(401);
  const body = await res.json();
  expect(body).toEqual({ error: "Unauthorized" });
});

// --- AC-03 ---
test("GET /api/v1/nodes returns 200 with empty array", async () => {
  const res = await req("/api/v1/nodes");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual([]);
});

// --- AC-04 ---
test("node CRUD lifecycle", async () => {
  // POST
  const createRes = await req("/api/v1/nodes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "test-node", host: "1.2.3.4", port: 443, protocol: "hysteria2" }),
  });
  expect(createRes.status).toBe(201);
  const node = await createRes.json() as any;
  expect(typeof node.id).toBe("string");
  expect(typeof node.name).toBe("string");
  expect(typeof node.host).toBe("string");
  expect(typeof node.port).toBe("number");
  expect(typeof node.protocol).toBe("string");

  // PATCH
  const patchRes = await req(`/api/v1/nodes/${node.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "updated" }),
  });
  expect(patchRes.status).toBe(200);
  const updated = await patchRes.json() as any;
  expect(updated.name).toBe("updated");

  // DELETE
  const deleteRes = await req(`/api/v1/nodes/${node.id}`, { method: "DELETE" });
  expect(deleteRes.status).toBe(204);
  expect(await deleteRes.text()).toBe("");
});

// --- AC-05 ---
test("GET /api/v1/users returns 200 with empty array", async () => {
  const res = await req("/api/v1/users");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual([]);
});

// --- AC-06 ---
test("user CRUD lifecycle", async () => {
  // POST
  const createRes = await req("/api/v1/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "alice", password: "pass123" }),
  });
  expect(createRes.status).toBe(201);
  const user = await createRes.json() as any;
  expect(typeof user.id).toBe("string");
  expect(typeof user.name).toBe("string");
  expect(typeof user.password).toBe("string");

  // PATCH
  const patchRes = await req(`/api/v1/users/${user.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quota_bytes: 1000 }),
  });
  expect(patchRes.status).toBe(200);
  const updated = await patchRes.json() as any;
  expect(updated.quota_bytes).toBe(1000);

  // DELETE
  const deleteRes = await req(`/api/v1/users/${user.id}`, { method: "DELETE" });
  expect(deleteRes.status).toBe(204);
  expect(await deleteRes.text()).toBe("");
});

// --- AC-07 ---
test("compound user create with nodes and subscription", async () => {
  const node = addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });

  const res = await req("/api/v1/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "bob",
      password: "pass456",
      nodes: "all",
      subscribe: "singbox",
    }),
  });
  expect(res.status).toBe(201);
  const body = await res.json() as any;

  expect(typeof body.user.id).toBe("string");
  expect(typeof body.user.name).toBe("string");
  expect(Array.isArray(body.nodes)).toBe(true);
  expect(body.nodes.length).toBeGreaterThanOrEqual(1);
  expect(typeof body.subscription.id).toBe("string");
  expect(typeof body.subscription.token).toBe("string");
  expect(body.subscription.format).toBe("singbox");
  expect(typeof body.subscription.url).toBe("string");

  // Verify exactly three keys
  expect(Object.keys(body).sort()).toEqual(["nodes", "subscription", "user"]);
});

// --- AC-08 ---
test("node assignment operations", async () => {
  const node1 = addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
  const node2 = addNode(db, { name: "n2", host: "2.2.2.2", port: 443, protocol: "hysteria2" });
  const user = createUser(db, { name: "alice", password: "pass123" });

  // PUT — replace
  const putRes = await req(`/api/v1/users/${user.id}/nodes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ node_ids: [node1.id] }),
  });
  expect(putRes.status).toBe(200);

  // POST — add
  const postRes = await req(`/api/v1/users/${user.id}/nodes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ node_id: node2.id }),
  });
  expect(postRes.status).toBe(200);
  const postBody = await postRes.json() as any;
  expect(typeof postBody.added).toBe("boolean");

  // GET — list
  const getRes = await req(`/api/v1/users/${user.id}/nodes`);
  expect(getRes.status).toBe(200);
  const nodes = await getRes.json() as any[];
  expect(nodes.length).toBe(2);

  // DELETE — remove
  const delRes = await req(`/api/v1/users/${user.id}/nodes/${node2.id}`, { method: "DELETE" });
  expect(delRes.status).toBe(200);
  const delBody = await delRes.json() as any;
  expect(typeof delBody.removed).toBe("boolean");
});

// --- AC-09 ---
test("reset traffic returns 200", async () => {
  const user = createUser(db, { name: "alice", password: "pass123" });
  const res = await req(`/api/v1/users/${user.id}/reset-traffic`, { method: "POST" });
  expect(res.status).toBe(200);
});

// --- AC-10 ---
test("subscription generate list delete", async () => {
  const user = createUser(db, { name: "alice", password: "pass123" });

  // POST — generate
  const postRes = await req(`/api/v1/users/${user.id}/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format: "clash" }),
  });
  expect(postRes.status).toBe(201);
  const sub = await postRes.json() as any;
  expect(typeof sub.id).toBe("string");
  expect(typeof sub.token).toBe("string");
  expect(sub.format).toBe("clash");

  // GET — list
  const getRes = await req(`/api/v1/users/${user.id}/subscriptions`);
  expect(getRes.status).toBe(200);
  const subs = await getRes.json() as any[];
  expect(subs.length).toBe(1);

  // DELETE
  const delRes = await req(`/api/v1/subscriptions/${sub.id}`, { method: "DELETE" });
  expect(delRes.status).toBe(204);
  expect(await delRes.text()).toBe("");
});

// --- AC-11 ---
test("traffic stats returns aggregated totals", async () => {
  const res = await req("/api/v1/traffic");
  expect(res.status).toBe(200);
  const body = await res.json() as any;
  expect(typeof body.total_tx).toBe("number");
  expect(typeof body.total_rx).toBe("number");
  expect(typeof body.total_bytes).toBe("number");
  expect(Object.keys(body).sort()).toEqual(["total_bytes", "total_rx", "total_tx"]);
});

// --- AC-12 ---
test("health check returns node statuses", async () => {
  addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
  const res = await req("/api/v1/health");
  expect(res.status).toBe(200);
  const body = await res.json() as any;
  expect(Array.isArray(body.nodes)).toBe(true);
  expect(body.nodes.length).toBe(1);
  expect(typeof body.nodes[0].id).toBe("string");
  expect(typeof body.nodes[0].name).toBe("string");
  expect(typeof body.nodes[0].status).toBe("string");
});

// --- AC-13 ---
test("settings CRUD lifecycle", async () => {
  // PUT
  const putRes = await req("/api/v1/settings/test_key", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: "test_value" }),
  });
  expect(putRes.status).toBe(200);

  // GET
  const getRes = await req("/api/v1/settings");
  expect(getRes.status).toBe(200);
  const settings = await getRes.json() as any[];
  const setting = settings.find((s: any) => s.key === "test_key");
  expect(typeof setting.key).toBe("string");
  expect(setting.key).toBe("test_key");
  expect(typeof setting.masked_value).toBe("string");
  expect(typeof setting.updated_at).toBe("string");

  // DELETE
  const delRes = await req("/api/v1/settings/test_key", { method: "DELETE" });
  expect(delRes.status).toBe(204);
  expect(await delRes.text()).toBe("");
});

// --- AC-14 ---
test("sync nodes returns 200", async () => {
  const res = await req("/api/v1/nodes/sync", { method: "POST" });
  expect(res.status).toBe(200);
});

// --- AC-16 ---
test("not found returns 404 with error body", async () => {
  const userRes = await req("/api/v1/users/nonexistent-id");
  expect(userRes.status).toBe(404);
  const userBody = await userRes.json() as any;
  expect(typeof userBody.error).toBe("string");
  expect(Object.keys(userBody)).toEqual(["error"]);

  const nodeRes = await req("/api/v1/nodes/nonexistent-id", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "x" }),
  });
  expect(nodeRes.status).toBe(404);
  const nodeBody = await nodeRes.json() as any;
  expect(typeof nodeBody.error).toBe("string");
  expect(Object.keys(nodeBody)).toEqual(["error"]);
});

// --- AC-17 ---
test("list endpoints accept limit and offset", async () => {
  const res = await req("/api/v1/users?limit=10&offset=0");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual([]);
});
