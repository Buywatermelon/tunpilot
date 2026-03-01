import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase } from "../db/index";
import { addNode } from "../services/node";
import { createUser, assignNodesToUser } from "../services/user";
import { generateSubscription } from "../services/subscription";
import { createHttpApp } from "./index";

const BASE_URL = "https://tunpilot.example.com";

let db: Database;
let app: ReturnType<typeof createHttpApp>;

beforeEach(() => {
  db = initDatabase(":memory:");
  app = createHttpApp(db, BASE_URL);
});

afterEach(() => {
  db.close();
});

function req(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

// --- Auth ---

describe("POST /auth/:nodeId/:authSecret", () => {
  test("valid auth returns 200 {ok: true, id: username}", async () => {
    const node = addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    const user = createUser(db, { name: "alice", password: "pass123" });
    assignNodesToUser(db, user.id, [node.id]);

    const res = await req(`/auth/${node.id}/${node.auth_secret}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addr: "1.2.3.4:12345", auth: "pass123", tx: 0 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.id).toBe("alice");
  });

  test("wrong password returns 200 {ok: false}", async () => {
    const node = addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });

    const res = await req(`/auth/${node.id}/${node.auth_secret}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addr: "1.2.3.4:12345", auth: "wrongpass", tx: 0 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("wrong auth_secret returns 200 {ok: false}", async () => {
    const node = addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    const user = createUser(db, { name: "alice", password: "pass123" });
    assignNodesToUser(db, user.id, [node.id]);

    const res = await req(`/auth/${node.id}/wrong_secret`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addr: "1.2.3.4:12345", auth: "pass123", tx: 0 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("disabled user returns 200 {ok: false}", async () => {
    const node = addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    const user = createUser(db, { name: "alice", password: "pass123" });
    assignNodesToUser(db, user.id, [node.id]);
    db.run(`UPDATE users SET enabled = 0 WHERE id = '${user.id}'`);

    const res = await req(`/auth/${node.id}/${node.auth_secret}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addr: "1.2.3.4:12345", auth: "pass123", tx: 0 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("expired user returns 200 {ok: false}", async () => {
    const node = addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    const user = createUser(db, {
      name: "alice",
      password: "pass123",
      expires_at: "2020-01-01 00:00:00",
    });
    assignNodesToUser(db, user.id, [node.id]);

    const res = await req(`/auth/${node.id}/${node.auth_secret}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addr: "1.2.3.4:12345", auth: "pass123", tx: 0 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("over-quota user returns 200 {ok: false}", async () => {
    const node = addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    const user = createUser(db, { name: "alice", password: "pass123", quota_bytes: 1000 });
    assignNodesToUser(db, user.id, [node.id]);
    db.run(`UPDATE users SET used_bytes = 1000 WHERE id = '${user.id}'`);

    const res = await req(`/auth/${node.id}/${node.auth_secret}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addr: "1.2.3.4:12345", auth: "pass123", tx: 0 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("user without node permission returns 200 {ok: false}", async () => {
    const node = addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    createUser(db, { name: "alice", password: "pass123" });
    // Not assigned to node

    const res = await req(`/auth/${node.id}/${node.auth_secret}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addr: "1.2.3.4:12345", auth: "pass123", tx: 0 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("missing body returns 200 {ok: false}", async () => {
    const node = addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });

    const res = await req(`/auth/${node.id}/${node.auth_secret}`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});

// --- Subscription ---

describe("GET /sub/:token", () => {
  function setupUserWithSub(format: string) {
    const node = addNode(db, {
      name: "tokyo-1",
      host: "203.0.113.1",
      port: 443,
      protocol: "hysteria2",
      sni: "example.com",
    });
    const user = createUser(db, { name: "alice", password: "pass123" });
    assignNodesToUser(db, user.id, [node.id]);
    const sub = generateSubscription(db, user.id, format);
    return { node, user, sub };
  }

  test("shadowrocket returns base64 text/plain", async () => {
    const { sub } = setupUserWithSub("shadowrocket");
    const res = await req(`/sub/${sub.token}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const text = await res.text();
    // Should be valid base64
    expect(() => atob(text)).not.toThrow();
  });

  test("singbox returns application/json", async () => {
    const { sub } = setupUserWithSub("singbox");
    const res = await req(`/sub/${sub.token}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json.outbounds).toBeDefined();
  });

  test("clash returns text/yaml", async () => {
    const { sub } = setupUserWithSub("clash");
    const res = await req(`/sub/${sub.token}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/yaml");
    const text = await res.text();
    expect(text).toContain("proxies:");
  });

  test("invalid token returns 404", async () => {
    const res = await req("/sub/nonexistent-token");
    expect(res.status).toBe(404);
  });
});

// --- Health ---

describe("GET /health", () => {
  test("returns 200 with status ok", async () => {
    const res = await req("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });
});
