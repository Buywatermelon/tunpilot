import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase } from "../db/index.ts";
import { createUser, assignNodesToUser } from "./user.ts";
import { addNode } from "./node.ts";
import {
  generateSubscription,
  listSubscriptions,
  getSubscriptionByToken,
  getSubscriptionConfig,
  renderShadowrocket,
  renderSingbox,
  renderClash,
} from "./subscription.ts";

describe("subscription service", () => {
  let db: Database;

  beforeEach(() => {
    db = initDatabase(":memory:");
  });

  afterEach(() => {
    db?.close();
  });

  function setupUserWithNodes() {
    const user = createUser(db, { name: "alice", password: "secret123" });
    const n1 = addNode(db, {
      name: "BWG-US",
      host: "us-node.example.com",
      port: 443,
      protocol: "hysteria2",
      sni: "us-node.example.com",
    });
    const n2 = addNode(db, {
      name: "IIJ-JP",
      host: "jp-node.example.com",
      port: 443,
      protocol: "hysteria2",
      sni: "jp-node.example.com",
    });
    assignNodesToUser(db, user.id, [n1.id, n2.id]);
    return { user, nodes: [n1, n2] };
  }

  // --- generateSubscription ---

  describe("generateSubscription", () => {
    test("creates subscription with UUID token", () => {
      const { user } = setupUserWithNodes();
      const sub = generateSubscription(db, user.id, "shadowrocket");
      expect(sub.id).toBeDefined();
      expect(sub.token).toBeDefined();
      expect(sub.token.length).toBe(36); // UUID
      expect(sub.format).toBe("shadowrocket");
      expect(sub.user_id).toBe(user.id);
    });

    test("generates unique tokens", () => {
      const { user } = setupUserWithNodes();
      const s1 = generateSubscription(db, user.id, "shadowrocket");
      const s2 = generateSubscription(db, user.id, "singbox");
      expect(s1.token).not.toBe(s2.token);
    });

    test("returns url when baseUrl is provided", () => {
      const { user } = setupUserWithNodes();
      const sub = generateSubscription(
        db,
        user.id,
        "shadowrocket",
        "https://tunpilot.example.com"
      );
      expect(sub.url).toBe(
        `https://tunpilot.example.com/sub/${sub.token}`
      );
    });

    test("url is undefined when baseUrl is not provided", () => {
      const { user } = setupUserWithNodes();
      const sub = generateSubscription(db, user.id, "shadowrocket");
      expect(sub.url).toBeUndefined();
    });
  });

  // --- listSubscriptions ---

  describe("listSubscriptions", () => {
    test("returns empty array for user with no subscriptions", () => {
      const { user } = setupUserWithNodes();
      expect(listSubscriptions(db, user.id)).toEqual([]);
    });

    test("returns all subscriptions for user", () => {
      const { user } = setupUserWithNodes();
      generateSubscription(db, user.id, "shadowrocket");
      generateSubscription(db, user.id, "singbox");
      const subs = listSubscriptions(db, user.id);
      expect(subs).toHaveLength(2);
      expect(subs.map((s) => s.format).sort()).toEqual([
        "shadowrocket",
        "singbox",
      ]);
    });
  });

  // --- getSubscriptionByToken ---

  describe("getSubscriptionByToken", () => {
    test("returns subscription by token", () => {
      const { user } = setupUserWithNodes();
      const sub = generateSubscription(db, user.id, "shadowrocket");
      const found = getSubscriptionByToken(db, sub.token);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(sub.id);
    });

    test("returns null for invalid token", () => {
      expect(getSubscriptionByToken(db, "invalid-token")).toBeNull();
    });
  });

  // --- renderShadowrocket ---

  describe("renderShadowrocket", () => {
    test("produces base64-encoded hysteria2 URIs", () => {
      const { user, nodes } = setupUserWithNodes();
      const result = renderShadowrocket(user, nodes);
      const decoded = atob(result);
      const lines = decoded.trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain("hysteria2://secret123@us-node.example.com:443");
      expect(lines[0]).toContain("sni=us-node.example.com");
      expect(lines[0]).toContain("#BWG-US");
      expect(lines[1]).toContain("hysteria2://secret123@jp-node.example.com:443");
      expect(lines[1]).toContain("#IIJ-JP");
    });

    test("uses host as sni fallback when sni is null", () => {
      const user = createUser(db, { name: "bob", password: "pass" });
      const node = addNode(db, {
        name: "HK-Node",
        host: "1.2.3.4",
        port: 8443,
        protocol: "hysteria2",
      });
      const result = renderShadowrocket(user, [node]);
      const decoded = atob(result);
      expect(decoded).toContain("sni=1.2.3.4");
    });
  });

  // --- renderSingbox ---

  describe("renderSingbox", () => {
    test("produces valid JSON with correct outbounds", () => {
      const { user, nodes } = setupUserWithNodes();
      const config = renderSingbox(user, nodes);
      expect(config.outbounds).toBeDefined();

      // Find hysteria2 outbounds
      const hy2Outbounds = config.outbounds.filter(
        (o: any) => o.type === "hysteria2"
      );
      expect(hy2Outbounds).toHaveLength(2);
      expect(hy2Outbounds[0].tag).toBe("BWG-US");
      expect(hy2Outbounds[0].server).toBe("us-node.example.com");
      expect(hy2Outbounds[0].server_port).toBe(443);
      expect(hy2Outbounds[0].password).toBe("secret123");
      expect(hy2Outbounds[0].tls.server_name).toBe("us-node.example.com");
    });

    test("includes selector and auto outbounds", () => {
      const { user, nodes } = setupUserWithNodes();
      const config = renderSingbox(user, nodes);
      const selector = config.outbounds.find((o: any) => o.type === "selector");
      expect(selector).toBeDefined();
      expect(selector.outbounds).toContain("BWG-US");
      expect(selector.outbounds).toContain("IIJ-JP");

      const auto = config.outbounds.find((o: any) => o.type === "urltest");
      expect(auto).toBeDefined();
      expect(auto.outbounds).toContain("BWG-US");
    });
  });

  // --- renderClash ---

  describe("renderClash", () => {
    test("produces YAML with proxies", () => {
      const { user, nodes } = setupUserWithNodes();
      const yaml = renderClash(user, nodes);
      expect(yaml).toContain("proxies:");
      expect(yaml).toContain('name: "BWG-US"');
      expect(yaml).toContain("server: us-node.example.com");
      expect(yaml).toContain("port: 443");
      expect(yaml).toContain('password: "secret123"');
      expect(yaml).toContain("sni: us-node.example.com");
    });

    test("includes proxy groups", () => {
      const { user, nodes } = setupUserWithNodes();
      const yaml = renderClash(user, nodes);
      expect(yaml).toContain("proxy-groups:");
      expect(yaml).toContain("- BWG-US");
      expect(yaml).toContain("- IIJ-JP");
    });

    test("includes rules", () => {
      const { user, nodes } = setupUserWithNodes();
      const yaml = renderClash(user, nodes);
      expect(yaml).toContain("rules:");
      expect(yaml).toContain("MATCH,Proxy");
    });
  });

  // --- getSubscriptionConfig ---

  describe("getSubscriptionConfig", () => {
    test("returns shadowrocket config with text/plain content type", () => {
      const { user } = setupUserWithNodes();
      const sub = generateSubscription(db, user.id, "shadowrocket");
      const result = getSubscriptionConfig(db, sub.token);
      expect(result).not.toBeNull();
      expect(result!.contentType).toBe("text/plain; charset=utf-8");
      // Content should be valid base64
      expect(() => atob(result!.content)).not.toThrow();
    });

    test("returns singbox config with application/json content type", () => {
      const { user } = setupUserWithNodes();
      const sub = generateSubscription(db, user.id, "singbox");
      const result = getSubscriptionConfig(db, sub.token);
      expect(result).not.toBeNull();
      expect(result!.contentType).toBe("application/json");
      const parsed = JSON.parse(result!.content);
      expect(parsed.outbounds).toBeDefined();
    });

    test("returns clash config with text/yaml content type", () => {
      const { user } = setupUserWithNodes();
      const sub = generateSubscription(db, user.id, "clash");
      const result = getSubscriptionConfig(db, sub.token);
      expect(result).not.toBeNull();
      expect(result!.contentType).toBe("text/yaml; charset=utf-8");
      expect(result!.content).toContain("proxies:");
    });

    test("returns null for invalid token", () => {
      const result = getSubscriptionConfig(db, "nonexistent-token");
      expect(result).toBeNull();
    });

    test("only includes enabled nodes", () => {
      const user = createUser(db, { name: "charlie", password: "pass" });
      const n1 = addNode(db, {
        name: "Enabled-Node",
        host: "1.1.1.1",
        port: 443,
        protocol: "hysteria2",
      });
      const n2 = addNode(db, {
        name: "Disabled-Node",
        host: "2.2.2.2",
        port: 443,
        protocol: "hysteria2",
        enabled: 0,
      });
      assignNodesToUser(db, user.id, [n1.id, n2.id]);
      const sub = generateSubscription(db, user.id, "shadowrocket");
      const result = getSubscriptionConfig(db, sub.token);
      const decoded = atob(result!.content);
      expect(decoded).toContain("Enabled-Node");
      expect(decoded).not.toContain("Disabled-Node");
    });
  });
});
