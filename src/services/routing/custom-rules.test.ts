import { describe, test, expect, beforeEach } from "bun:test";
import { initDatabase, type Db } from "../../db/index";
import {
  addCustomRule,
  listCustomRules,
  getActiveCustomRules,
  removeCustomRule,
  getCustomRule,
  updateCustomRule,
} from "./custom-rules";

let db: Db;

beforeEach(() => {
  db = initDatabase(":memory:");
});

describe("addCustomRule", () => {
  test("创建 domain_suffix 规则", () => {
    const rule = addCustomRule(db, {
      type: "domain_suffix",
      value: "adspower.net",
      action: "direct",
      description: "AdsPower 指纹浏览器",
    });
    expect(rule.id).toBeTruthy();
    expect(rule.type).toBe("domain_suffix");
    expect(rule.value).toBe("adspower.net");
    expect(rule.action).toBe("direct");
    expect(rule.priority).toBe(100);
    expect(rule.description).toBe("AdsPower 指纹浏览器");
  });

  test("创建 domain 精确匹配规则", () => {
    const rule = addCustomRule(db, {
      type: "domain",
      value: "start.adspower.net",
      action: "direct",
    });
    expect(rule.type).toBe("domain");
    expect(rule.value).toBe("start.adspower.net");
  });

  test("创建 ip_cidr 规则", () => {
    const rule = addCustomRule(db, {
      type: "ip_cidr",
      value: "192.168.1.0/24",
      action: "direct",
    });
    expect(rule.type).toBe("ip_cidr");
    expect(rule.value).toBe("192.168.1.0/24");
  });

  test("创建 domain_keyword 规则", () => {
    const rule = addCustomRule(db, {
      type: "domain_keyword",
      value: "adspower",
      action: "reject",
    });
    expect(rule.type).toBe("domain_keyword");
    expect(rule.action).toBe("reject");
  });

  test("自定义优先级", () => {
    const rule = addCustomRule(db, {
      type: "domain_suffix",
      value: "example.com",
      action: "proxy",
      priority: 200,
    });
    expect(rule.priority).toBe(200);
  });

  test("value 自动 trim 和 lowercase", () => {
    const rule = addCustomRule(db, {
      type: "domain_suffix",
      value: "  Example.COM  ",
      action: "direct",
    });
    expect(rule.value).toBe("example.com");
  });

  test("无效 type 抛出错误", () => {
    expect(() =>
      addCustomRule(db, { type: "invalid", value: "test.com", action: "direct" }),
    ).toThrow("Invalid type");
  });

  test("无效 action 抛出错误", () => {
    expect(() =>
      addCustomRule(db, { type: "domain", value: "test.com", action: "invalid" }),
    ).toThrow("Invalid action");
  });

  test("空 value 抛出错误", () => {
    expect(() =>
      addCustomRule(db, { type: "domain", value: "  ", action: "direct" }),
    ).toThrow("Value cannot be empty");
  });

  test("ip_cidr 无前缀长度抛出错误", () => {
    expect(() =>
      addCustomRule(db, { type: "ip_cidr", value: "192.168.1.0", action: "direct" }),
    ).toThrow("prefix length");
  });
});

describe("listCustomRules", () => {
  test("无规则时返回空数组", () => {
    expect(listCustomRules(db)).toEqual([]);
  });

  test("按 priority DESC 排序", () => {
    addCustomRule(db, { type: "domain", value: "low.com", action: "direct", priority: 50 });
    addCustomRule(db, { type: "domain", value: "high.com", action: "direct", priority: 200 });
    addCustomRule(db, { type: "domain", value: "mid.com", action: "direct", priority: 100 });

    const rules = listCustomRules(db);
    expect(rules.map((r) => r.value)).toEqual(["high.com", "mid.com", "low.com"]);
  });
});

describe("getActiveCustomRules", () => {
  test("仅返回 enabled=1 的规则", () => {
    addCustomRule(db, { type: "domain", value: "active.com", action: "direct" });
    const disabled = addCustomRule(db, { type: "domain", value: "disabled.com", action: "direct" });
    // 手动禁用
    db.run(`UPDATE custom_rules SET enabled = 0 WHERE id = '${disabled.id}'`);

    const active = getActiveCustomRules(db);
    expect(active).toHaveLength(1);
    expect(active[0].value).toBe("active.com");
  });
});

describe("removeCustomRule", () => {
  test("删除已有规则", () => {
    const rule = addCustomRule(db, { type: "domain", value: "test.com", action: "direct" });
    removeCustomRule(db, rule.id);
    expect(listCustomRules(db)).toHaveLength(0);
  });

  test("删除不存在的规则抛出错误", () => {
    expect(() => removeCustomRule(db, "nonexistent")).toThrow("not found");
  });
});

describe("getCustomRule", () => {
  test("返回指定 ID 的规则", () => {
    const rule = addCustomRule(db, { type: "domain", value: "test.com", action: "direct" });
    const found = getCustomRule(db, rule.id);
    expect(found).not.toBeNull();
    expect(found!.value).toBe("test.com");
  });

  test("不存在时返回 null", () => {
    expect(getCustomRule(db, "nonexistent")).toBeNull();
  });
});

describe("updateCustomRule", () => {
  test("更新 action", () => {
    const rule = addCustomRule(db, { type: "domain", value: "test.com", action: "direct" });
    const updated = updateCustomRule(db, rule.id, { action: "proxy" });
    expect(updated.action).toBe("proxy");
  });

  test("更新 priority 和 enabled", () => {
    const rule = addCustomRule(db, { type: "domain", value: "test.com", action: "direct" });
    const updated = updateCustomRule(db, rule.id, { priority: 50, enabled: false });
    expect(updated.priority).toBe(50);
    expect(updated.enabled).toBe(0);
  });

  test("更新 value 自动规范化", () => {
    const rule = addCustomRule(db, { type: "domain", value: "test.com", action: "direct" });
    const updated = updateCustomRule(db, rule.id, { value: "  NEW.COM  " });
    expect(updated.value).toBe("new.com");
  });

  test("更新不存在的规则抛出错误", () => {
    expect(() => updateCustomRule(db, "nonexistent", { action: "proxy" })).toThrow("not found");
  });

  test("无效 type 抛出错误", () => {
    const rule = addCustomRule(db, { type: "domain", value: "test.com", action: "direct" });
    expect(() => updateCustomRule(db, rule.id, { type: "bad" })).toThrow("Invalid type");
  });

  test("更新导致重复时抛出错误", () => {
    addCustomRule(db, { type: "domain", value: "a.com", action: "direct" });
    const rule2 = addCustomRule(db, { type: "domain", value: "b.com", action: "proxy" });
    expect(() => updateCustomRule(db, rule2.id, { value: "a.com" })).toThrow("Duplicate");
  });
});

describe("重复检测", () => {
  test("添加相同 type+value 抛出错误", () => {
    addCustomRule(db, { type: "domain_suffix", value: "test.com", action: "direct" });
    expect(() =>
      addCustomRule(db, { type: "domain_suffix", value: "test.com", action: "proxy" }),
    ).toThrow("Duplicate");
  });

  test("不同 type 相同 value 允许", () => {
    addCustomRule(db, { type: "domain", value: "test.com", action: "direct" });
    expect(() =>
      addCustomRule(db, { type: "domain_suffix", value: "test.com", action: "proxy" }),
    ).not.toThrow();
  });
});

describe("渲染集成", () => {
  test("自定义规则在 Surge 配置中正确渲染", () => {
    const { surge } = require("../formats/surge");
    addCustomRule(db, { type: "domain_suffix", value: "adspower.net", action: "direct" });
    addCustomRule(db, { type: "domain", value: "blocked.com", action: "reject" });

    const user = { id: "u1", name: "test", password: "pass", quota_bytes: 0, used_bytes: 0, expires_at: null, max_devices: 3, enabled: 1, created_at: null };
    const nodes = [{ id: "n1", name: "US-Node", host: "1.2.3.4", port: 443, protocol: "hysteria2", auth_secret: "s", sni: null, cert_fingerprint: null, stats_port: null, stats_secret: null, cert_path: null, cert_expires: null, hy2_version: null, config_path: null, ssh_user: null, ssh_port: null, ssh_alias: null, insecure: 0, enabled: 1, created_at: null }];
    const customRules = getActiveCustomRules(db);

    const config = surge.render(user, nodes, { customRules });
    expect(config).toContain("DOMAIN-SUFFIX,adspower.net,DIRECT");
    expect(config).toContain("DOMAIN,blocked.com,REJECT");
    // 自定义规则应在 [Rule] 之后、分类规则之前
    const ruleIndex = config.indexOf("[Rule]");
    const customIndex = config.indexOf("DOMAIN-SUFFIX,adspower.net");
    expect(customIndex).toBeGreaterThan(ruleIndex);
  });

  test("自定义规则在 Clash 配置中正确渲染", () => {
    const { clash } = require("../formats/clash");
    addCustomRule(db, { type: "domain_suffix", value: "adspower.net", action: "direct" });
    addCustomRule(db, { type: "ip_cidr", value: "10.0.0.0/8", action: "direct" });

    const user = { id: "u1", name: "test", password: "pass", quota_bytes: 0, used_bytes: 0, expires_at: null, max_devices: 3, enabled: 1, created_at: null };
    const nodes = [{ id: "n1", name: "US-Node", host: "1.2.3.4", port: 443, protocol: "hysteria2", auth_secret: "s", sni: null, cert_fingerprint: null, stats_port: null, stats_secret: null, cert_path: null, cert_expires: null, hy2_version: null, config_path: null, ssh_user: null, ssh_port: null, ssh_alias: null, insecure: 0, enabled: 1, created_at: null }];
    const customRules = getActiveCustomRules(db);

    const config = clash.render(user, nodes, { customRules });
    expect(config).toContain("DOMAIN-SUFFIX,adspower.net,DIRECT");
    expect(config).toContain("IP-CIDR,10.0.0.0/8,DIRECT,no-resolve");
  });

  test("自定义规则在 Singbox 配置中正确渲染", () => {
    const { singbox } = require("../formats/singbox");
    addCustomRule(db, { type: "domain_suffix", value: "adspower.net", action: "direct" });
    addCustomRule(db, { type: "domain_suffix", value: "adspower.com", action: "direct" });
    addCustomRule(db, { type: "domain_keyword", value: "tracking", action: "reject" });

    const user = { id: "u1", name: "test", password: "pass", quota_bytes: 0, used_bytes: 0, expires_at: null, max_devices: 3, enabled: 1, created_at: null };
    const nodes = [{ id: "n1", name: "US-Node", host: "1.2.3.4", port: 443, protocol: "hysteria2", auth_secret: "s", sni: null, cert_fingerprint: null, stats_port: null, stats_secret: null, cert_path: null, cert_expires: null, hy2_version: null, config_path: null, ssh_user: null, ssh_port: null, ssh_alias: null, insecure: 0, enabled: 1, created_at: null }];
    const customRules = getActiveCustomRules(db);

    const config = JSON.parse(singbox.render(user, nodes, { customRules }));
    const routeRules = config.route.rules;

    // 自定义规则在 sniff/dns-hijack 之后
    // direct 规则：domain_suffix 合并
    const directRule = routeRules.find((r: Record<string, unknown>) =>
      r.domain_suffix && (r.domain_suffix as string[]).includes("adspower.net"),
    );
    expect(directRule).toBeTruthy();
    expect(directRule.domain_suffix).toContain("adspower.com");
    expect(directRule.outbound).toBe("direct");

    // reject 规则
    const rejectRule = routeRules.find((r: Record<string, unknown>) =>
      r.domain_keyword && (r.domain_keyword as string[]).includes("tracking"),
    );
    expect(rejectRule).toBeTruthy();
    expect(rejectRule.action).toBe("reject");
  });
});
