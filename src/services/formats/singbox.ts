import type { User, Node } from "../../db/schema";
import type { SubscriptionFormat, RenderMeta } from "./index";
import {
  RULE_SET_CATALOG,
  type SingboxRemote,
  type SingboxInline,
} from "../routing/catalog";
import { resolveAllRules } from "../routing/resolve";
import type { CustomRule } from "../../db/schema";
import { buildProxyConfig } from "./proxy";

// 将自定义规则转为 sing-box route rule 对象
function renderCustomRules(rules: CustomRule[]): Record<string, unknown>[] {
  // 按 action 分组，合并同 action 的规则为一条 sing-box route rule
  const grouped = new Map<string, CustomRule[]>();
  for (const rule of rules) {
    const list = grouped.get(rule.action) ?? [];
    list.push(rule);
    grouped.set(rule.action, list);
  }

  const result: Record<string, unknown>[] = [];
  for (const [action, group] of grouped) {
    const entry: Record<string, unknown> = {};
    const domains: string[] = [];
    const domainSuffixes: string[] = [];
    const domainKeywords: string[] = [];
    const ipCidrs: string[] = [];

    for (const rule of group) {
      switch (rule.type) {
        case "domain":
          domains.push(rule.value);
          break;
        case "domain_suffix":
          domainSuffixes.push(rule.value);
          break;
        case "domain_keyword":
          domainKeywords.push(rule.value);
          break;
        case "ip_cidr":
          ipCidrs.push(rule.value);
          break;
      }
    }

    if (domains.length > 0) entry.domain = domains;
    if (domainSuffixes.length > 0) entry.domain_suffix = domainSuffixes;
    if (domainKeywords.length > 0) entry.domain_keyword = domainKeywords;
    if (ipCidrs.length > 0) entry.ip_cidr = ipCidrs;

    if (action === "reject") {
      entry.action = "reject";
    } else {
      entry.outbound = action;
    }

    result.push(entry);
  }

  return result;
}

export const singbox: SubscriptionFormat = {
  name: "singbox",
  contentType: "application/json",

  render(user: User, nodes: Node[], meta?: RenderMeta): string {
    const nodeNames = nodes.map((n) => n.name);
    const routingRules = meta?.routingRules ?? [];
    const allNodes = meta?.allNodes ?? nodes;
    const resolved = resolveAllRules(routingRules, nodes, allNodes);

    const proxyOutbounds = nodes.map((n) => {
      const p = buildProxyConfig(n, user);
      const tls: Record<string, unknown> = {
        enabled: true,
        server_name: p.sni,
      };
      if (p.insecure) {
        tls.insecure = true;
      }
      if (p.protocol === "trojan") {
        return { type: "trojan" as const, tag: p.name, server: p.server, server_port: p.port, password: p.password, tls };
      }
      const hy2: Record<string, unknown> = { type: "hysteria2" as const, tag: p.name, server: p.server, server_port: p.port, password: p.password, tls };
      if (p.obfs) {
        hy2.obfs = { type: p.obfs.type, password: p.obfs.password };
      }
      if (p.portHopping) {
        hy2.hop_ports = p.portHopping;
        hy2.hop_interval = "30s";
      }
      return hy2;
    });

    // 动态构建 route.rules 和 route.rule_set
    const routeRules: Record<string, unknown>[] = [
      { action: "sniff" },
      { protocol: "dns", action: "hijack-dns" },
    ];
    const ruleSetDefs: Record<string, unknown>[] = [];
    const ruleSetTags = new Set<string>();

    // 收集需要用于 DNS 分流的 CN geosite tag
    let cnGeositeTags: string[] = [];

    // 自定义域名/IP 规则（优先级最高，排在分类规则之前）
    const customRulesList = meta?.customRules ?? [];
    if (customRulesList.length > 0) {
      routeRules.push(...renderCustomRules(customRulesList));
    }

    for (const { rule, outbound } of resolved) {
      const catalog = RULE_SET_CATALOG[rule.rule_set_key];
      if (!catalog) continue;

      const def = catalog.singbox;

      if ("type" in def && def.type === "final") {
        // 兜底规则由 route.final 处理
        continue;
      }

      if ("type" in def && def.type === "inline") {
        const inlineDef = def as SingboxInline;
        const entry: Record<string, unknown> = { ...inlineDef.rule };
        if (outbound === "reject") {
          entry.action = "reject";
        } else {
          entry.outbound = outbound;
        }
        routeRules.push(entry);
        continue;
      }

      // 远程 rule_set
      const remoteDef = def as SingboxRemote;
      const tags = remoteDef.ruleSets.map((rs) => rs.tag);

      // 注册 rule_set 定义（去重）
      for (const rs of remoteDef.ruleSets) {
        if (!ruleSetTags.has(rs.tag)) {
          ruleSetTags.add(rs.tag);
          ruleSetDefs.push({
            type: "remote",
            tag: rs.tag,
            format: "binary",
            url: rs.url,
            download_detour: "direct",
            update_interval: "1d",
          });
        }
      }

      // 记录 CN geosite 用于 DNS 分流
      if (rule.rule_set_key === "cn") {
        cnGeositeTags = remoteDef.ruleSets
          .filter((rs) => rs.type === "geosite")
          .map((rs) => rs.tag);
      }

      // 生成 route rule
      const entry: Record<string, unknown> = { rule_set: tags };
      if (outbound === "reject") {
        entry.action = "reject";
      } else {
        entry.outbound = outbound;
      }
      routeRules.push(entry);
    }

    const config = {
      log: { level: "info", timestamp: true },
      dns: {
        servers: [
          { type: "https", tag: "dns-remote", server: "dns.google", server_port: 443, path: "/dns-query", domain_resolver: "dns-direct" },
          { type: "udp", tag: "dns-direct", server: "223.5.5.5", server_port: 53, detour: "direct" },
        ],
        rules: cnGeositeTags.length > 0
          ? [{ rule_set: cnGeositeTags, server: "dns-direct" }]
          : [],
        final: "dns-remote",
        strategy: "prefer_ipv4",
        independent_cache: true,
      },
      inbounds: [
        {
          type: "tun",
          tag: "tun-in",
          address: ["172.19.0.1/30", "fdfe:dcba:9876::1/126"],
          auto_route: true,
          strict_route: true,
          stack: "mixed",
        },
        {
          type: "mixed",
          tag: "mixed-in",
          listen: "127.0.0.1",
          listen_port: 2080,
        },
      ],
      outbounds: [
        {
          type: "selector",
          tag: "proxy",
          outbounds: [...nodeNames, "auto", "direct"],
          default: "auto",
        },
        {
          type: "urltest",
          tag: "auto",
          outbounds: [...nodeNames],
          url: "https://www.gstatic.com/generate_204",
          interval: "5m",
        },
        ...proxyOutbounds,
        { type: "direct", tag: "direct" },
      ],
      route: {
        rules: routeRules,
        rule_set: ruleSetDefs,
        auto_detect_interface: true,
        default_domain_resolver: "dns-direct",
        final: "proxy",
      },
      experimental: {
        cache_file: {
          enabled: true,
          store_rdrc: true,
        },
        clash_api: {
          external_controller: "127.0.0.1:12081",
        },
      },
    };

    return JSON.stringify(config);
  },
};
