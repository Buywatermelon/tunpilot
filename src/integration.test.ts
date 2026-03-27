import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, type Db } from "./db/index";
import { createHttpApp } from "./http/index";
import { addNode } from "./services/node";
import { createUser, assignNodesToUser } from "./services/user";
import { generateSubscription } from "./services/subscription";

const BASE_URL = "https://tunpilot.example.com";

let db: Db;
let app: ReturnType<typeof createHttpApp>;

function req(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

beforeEach(() => {
  db = initDatabase(":memory:");
  app = createHttpApp(db, BASE_URL);
});

afterEach(() => {
  db.$client.close();
});

describe("integration: legacy auth endpoint", () => {
  test("POST /auth/:nodeId/:authSecret is no longer exposed", async () => {
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

// --- Subscription Flow ---

describe("integration: subscription flow", () => {
  test("full subscription flow: create user + nodes + assign + subscribe + download", async () => {
    const node1 = addNode(db, {
      name: "US West",
      host: "198.51.100.1",
      port: 443,
      protocol: "hysteria2",
      sni: "us.example.com",
    });
    const node2 = addNode(db, {
      name: "JP Tokyo",
      host: "198.51.100.2",
      port: 443,
      protocol: "hysteria2",
      sni: "jp.example.com",
    });

    const user = createUser(db, { name: "carol", password: "mypassword" });
    assignNodesToUser(db, user.id, [node1.id, node2.id]);

    // Generate subscriptions in all formats
    const srSub = generateSubscription(db, user.id, "shadowrocket");
    const sbSub = generateSubscription(db, user.id, "singbox");
    const clSub = generateSubscription(db, user.id, "clash");

    // Shadowrocket: base64 URI list
    const srRes = await req(`/sub/${srSub.token}`);
    expect(srRes.status).toBe(200);
    const srText = await srRes.text();
    const srDecoded = Buffer.from(srText, "base64").toString();
    expect(srDecoded).toContain("hysteria2://");
    expect(srDecoded).toContain("carol%3Amypassword");
    expect(srDecoded).toContain("US%20West");
    expect(srDecoded).toContain("JP%20Tokyo");

    // Sing-box: JSON config with outbounds
    const sbRes = await req(`/sub/${sbSub.token}`);
    expect(sbRes.status).toBe(200);
    const sbJson = await sbRes.json() as any;
    expect(sbJson.outbounds).toBeDefined();
    const hy2Outbounds = sbJson.outbounds.filter((o: any) => o.type === "hysteria2");
    expect(hy2Outbounds).toHaveLength(2);
    expect(hy2Outbounds[0].password).toBe("carol:mypassword");

    // Clash: YAML with proxies
    const clRes = await req(`/sub/${clSub.token}`);
    expect(clRes.status).toBe(200);
    const clText = await clRes.text();
    expect(clText).toContain("proxies:");
    expect(clText).toContain("US West");
    expect(clText).toContain("JP Tokyo");
    expect(clText).toContain("carol:mypassword");
  });

  test("subscription only includes enabled nodes", async () => {
    const node1 = addNode(db, { name: "active", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    const node2 = addNode(db, { name: "disabled", host: "2.2.2.2", port: 443, protocol: "hysteria2", enabled: 0 });

    const user = createUser(db, { name: "alice", password: "pass" });
    assignNodesToUser(db, user.id, [node1.id, node2.id]);

    const sub = generateSubscription(db, user.id, "singbox");
    const res = await req(`/sub/${sub.token}`);
    const json = await res.json() as any;
    const hy2 = json.outbounds.filter((o: any) => o.type === "hysteria2");
    expect(hy2).toHaveLength(1);
    expect(hy2[0].tag).toBe("active");
  });
});

// --- Health ---

describe("integration: health endpoint", () => {
  test("GET /health returns 200 with status ok", async () => {
    const res = await req("/health");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });
});
