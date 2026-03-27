import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, type Db } from "../db/index";
import { addNode } from "../services/node";
import { createUser, assignNodesToUser } from "../services/user";
import { generateSubscription } from "../services/subscription";
import { createHttpApp } from "./index";

const BASE_URL = "https://tunpilot.example.com";

let db: Db;
let app: ReturnType<typeof createHttpApp>;

beforeEach(() => {
  db = initDatabase(":memory:");
  app = createHttpApp(db, BASE_URL);
});

afterEach(() => {
  db.$client.close();
});

function req(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

describe("legacy auth endpoint", () => {
  test("POST /auth/:nodeId/:authSecret returns 404", async () => {
    addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    const user = createUser(db, { name: "alice", password: "pass123" });
    assignNodesToUser(db, user.id, []);

    const res = await req("/auth/legacy-node/legacy-secret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addr: "1.2.3.4:12345", auth: "pass123", tx: 0 }),
    });

    expect(res.status).toBe(404);
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

  test("shadowrocket returns surge config (alias)", async () => {
    const { sub } = setupUserWithSub("shadowrocket");
    const res = await req(`/sub/${sub.token}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toContain("[Proxy]");
    expect(text).toContain("[Rule]");
  });

  test("singbox returns application/json", async () => {
    const { sub } = setupUserWithSub("singbox");
    const res = await req(`/sub/${sub.token}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json() as any;
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
    const body = await res.json() as any;
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });
});
