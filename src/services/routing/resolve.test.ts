import { describe, test, expect } from "bun:test";
import { resolveOutbound, resolveAllRules } from "./resolve";
import type { Node, RoutingRule } from "../../db/schema";

const makeNode = (id: string, name: string, enabled = 1): Node => ({
  id,
  name,
  host: "1.2.3.4",
  port: 443,
  protocol: "hysteria2",
  sni: null,
  cert_fingerprint: null,
  stats_port: null,
  stats_secret: null,
  cert_path: null,
  cert_expires: null,
  hy2_version: null,
  config_path: null,
  enabled,
  insecure: 0,
  ssh_alias: null,
  ssh_user: null,
  ssh_port: null,
  obfs_password: null,
  created_at: null,
});

const makeRule = (
  key: string,
  action: string,
  opts?: { strict?: number; priority?: number; enabled?: number },
): RoutingRule => ({
  id: `${key}-${action}`,
  rule_set_key: key,
  action,
  strict: opts?.strict ?? 0,
  priority: opts?.priority ?? 50,
  enabled: opts?.enabled ?? 1,
  created_at: null,
});

describe("resolveOutbound", () => {
  const nodeA = makeNode("node-a", "US-Node");
  const nodeB = makeNode("node-b", "JP-Node");
  const allNodes = [nodeA, nodeB];
  const userNodes = [nodeA, nodeB];

  test("direct/reject/proxy 直接返回", () => {
    expect(resolveOutbound(makeRule("cn", "direct"), userNodes, allNodes)).toBe("direct");
    expect(resolveOutbound(makeRule("ads", "reject"), userNodes, allNodes)).toBe("reject");
    expect(resolveOutbound(makeRule("match", "proxy"), userNodes, allNodes)).toBe("proxy");
  });

  test("有效的 node_id 返回节点名称", () => {
    expect(resolveOutbound(makeRule("openai", "node-a"), userNodes, allNodes)).toBe("US-Node");
  });

  test("用户没有该节点时 soft fallback 到 proxy", () => {
    const limitedUser = [nodeA];
    expect(resolveOutbound(makeRule("openai", "node-b"), limitedUser, allNodes)).toBe("proxy");
  });

  test("用户没有该节点且 strict=1 时 fallback 到 reject", () => {
    const limitedUser = [nodeA];
    expect(resolveOutbound(makeRule("openai", "node-b", { strict: 1 }), limitedUser, allNodes)).toBe("reject");
  });

  test("node_id 不存在时 soft fallback 到 proxy", () => {
    expect(resolveOutbound(makeRule("openai", "nonexistent"), userNodes, allNodes)).toBe("proxy");
  });

  test("node_id 不存在且 strict=1 时 fallback 到 reject", () => {
    expect(resolveOutbound(makeRule("openai", "nonexistent", { strict: 1 }), userNodes, allNodes)).toBe("reject");
  });
});

describe("resolveAllRules", () => {
  const nodeA = makeNode("node-a", "US-Node");
  const allNodes = [nodeA];
  const userNodes = [nodeA];

  test("按 priority DESC 排序", () => {
    const rules = [
      makeRule("cn", "direct", { priority: 80 }),
      makeRule("ads", "reject", { priority: 90 }),
      makeRule("match", "proxy", { priority: 0 }),
    ];
    const resolved = resolveAllRules(rules, userNodes, allNodes);
    expect(resolved.map((r) => r.rule.rule_set_key)).toEqual(["ads", "cn", "match"]);
  });

  test("过滤掉 enabled=0 的规则", () => {
    const rules = [
      makeRule("cn", "direct", { enabled: 1 }),
      makeRule("ads", "reject", { enabled: 0 }),
    ];
    const resolved = resolveAllRules(rules, userNodes, allNodes);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].rule.rule_set_key).toBe("cn");
  });

  test("空规则返回空数组", () => {
    expect(resolveAllRules([], userNodes, allNodes)).toEqual([]);
  });
});
