import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, type Db } from "../db/index";
import { createUser, assignNodesToUser } from "./user";
import { addNode } from "./node";
import {
  generateSubscription,
  listSubscriptions,
  getSubscriptionByToken,
  getSubscriptionConfig,
  renderShadowrocket,
  renderSingbox,
  renderClash,
} from "./subscription";

describe("订阅服务", () => {
  let db: Db;

  beforeEach(() => {
    db = initDatabase(":memory:");
  });

  afterEach(() => {
    db?.$client?.close();
  });

  // 创建带节点的测试用户
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

  describe("生成订阅", () => {
    test("创建带 UUID token 的订阅", () => {
      const { user } = setupUserWithNodes();
      const sub = generateSubscription(db, user.id, "shadowrocket");
      expect(sub.id).toBeDefined();
      expect(sub.token).toBeDefined();
      expect(sub.token.length).toBe(36); // UUID
      expect(sub.format).toBe("shadowrocket");
      expect(sub.user_id).toBe(user.id);
    });

    test("生成唯一 token", () => {
      const { user } = setupUserWithNodes();
      const s1 = generateSubscription(db, user.id, "shadowrocket");
      const s2 = generateSubscription(db, user.id, "singbox");
      expect(s1.token).not.toBe(s2.token);
    });

    test("提供 baseUrl 时返回完整链接", () => {
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

    test("未提供 baseUrl 时 url 为 undefined", () => {
      const { user } = setupUserWithNodes();
      const sub = generateSubscription(db, user.id, "shadowrocket");
      expect(sub.url).toBeUndefined();
    });
  });

  // --- listSubscriptions ---

  describe("列出订阅", () => {
    test("无订阅时返回空数组", () => {
      const { user } = setupUserWithNodes();
      expect(listSubscriptions(db, user.id)).toEqual([]);
    });

    test("返回用户的所有订阅", () => {
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

  describe("根据 token 获取订阅", () => {
    test("根据 token 返回订阅", () => {
      const { user } = setupUserWithNodes();
      const sub = generateSubscription(db, user.id, "shadowrocket");
      const found = getSubscriptionByToken(db, sub.token);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(sub.id);
    });

    test("无效 token 返回 null", () => {
      expect(getSubscriptionByToken(db, "invalid-token")).toBeNull();
    });
  });

  // --- renderShadowrocket ---

  describe("渲染 Shadowrocket 配置", () => {
    test("生成 Base64 编码的 hysteria2 URI", () => {
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

    test("sni 为空时使用 host 作为 fallback", () => {
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

  describe("渲染 Sing-box 配置", () => {
    test("生成包含正确 outbounds 的 JSON", () => {
      const { user, nodes } = setupUserWithNodes();
      const config = renderSingbox(user, nodes);
      expect(config.outbounds).toBeDefined();

      // 查找 hysteria2 outbounds
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

    test("包含 selector 和 auto outbounds", () => {
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

  describe("渲染 Clash 配置", () => {
    test("生成包含代理节点的 YAML", () => {
      const { user, nodes } = setupUserWithNodes();
      const yaml = renderClash(user, nodes);
      expect(yaml).toContain("proxies:");
      expect(yaml).toContain('name: "BWG-US"');
      expect(yaml).toContain("server: us-node.example.com");
      expect(yaml).toContain("port: 443");
      expect(yaml).toContain('password: "secret123"');
      expect(yaml).toContain("sni: us-node.example.com");
    });

    test("包含代理组", () => {
      const { user, nodes } = setupUserWithNodes();
      const yaml = renderClash(user, nodes);
      expect(yaml).toContain("proxy-groups:");
      expect(yaml).toContain("- BWG-US");
      expect(yaml).toContain("- IIJ-JP");
    });

    test("包含路由规则", () => {
      const { user, nodes } = setupUserWithNodes();
      const yaml = renderClash(user, nodes);
      expect(yaml).toContain("rules:");
      expect(yaml).toContain("MATCH,Proxy");
    });
  });

  // --- getSubscriptionConfig ---

  describe("获取订阅配置", () => {
    test("返回 Shadowrocket 配置（text/plain 类型）", () => {
      const { user } = setupUserWithNodes();
      const sub = generateSubscription(db, user.id, "shadowrocket");
      const result = getSubscriptionConfig(db, sub.token);
      expect(result).not.toBeNull();
      expect(result!.contentType).toBe("text/plain; charset=utf-8");
      // 内容应为有效的 Base64
      expect(() => atob(result!.content)).not.toThrow();
    });

    test("返回 Sing-box 配置（application/json 类型）", () => {
      const { user } = setupUserWithNodes();
      const sub = generateSubscription(db, user.id, "singbox");
      const result = getSubscriptionConfig(db, sub.token);
      expect(result).not.toBeNull();
      expect(result!.contentType).toBe("application/json");
      const parsed = JSON.parse(result!.content);
      expect(parsed.outbounds).toBeDefined();
    });

    test("返回 Clash 配置（text/yaml 类型）", () => {
      const { user } = setupUserWithNodes();
      const sub = generateSubscription(db, user.id, "clash");
      const result = getSubscriptionConfig(db, sub.token);
      expect(result).not.toBeNull();
      expect(result!.contentType).toBe("text/yaml; charset=utf-8");
      expect(result!.content).toContain("proxies:");
    });

    test("无效 token 返回 null", () => {
      const result = getSubscriptionConfig(db, "nonexistent-token");
      expect(result).toBeNull();
    });

    test("仅包含已启用的节点", () => {
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
