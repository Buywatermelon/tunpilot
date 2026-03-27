import type { User, Node } from "../../db/schema";
import type { SubscriptionFormat, RenderMeta } from "./index";
import { RULE_SET_CATALOG } from "../routing/catalog";
import { resolveAllRules } from "../routing/resolve";
import { renderSurgeStyleRules } from "./custom-rule-utils";
import { buildProxyConfig, mapOutbound } from "./proxy";

export const clash: SubscriptionFormat = {
  name: "clash",
  contentType: "text/yaml; charset=utf-8",

  render(user: User, nodes: Node[], meta?: RenderMeta): string {
    const routingRules = meta?.routingRules ?? [];
    const allNodes = meta?.allNodes ?? nodes;
    const resolved = resolveAllRules(routingRules, nodes, allNodes);

    const proxies = nodes
      .map((n) => {
        const p = buildProxyConfig(n, user);
        let entry = `  - name: "${p.name}"
    type: ${p.protocol}
    server: ${p.server}
    port: ${p.port}
    password: "${p.password}"
    sni: ${p.sni}`;
        if (p.certFingerprint) {
          entry += `\n    fingerprint: ${p.certFingerprint}`;
        }
        if (p.insecure) {
          entry += `\n    skip-cert-verify: true`;
        }
        if (p.obfs) {
          entry += `\n    obfs: ${p.obfs.type}\n    obfs-password: "${p.obfs.password}"`;
        }
        if (p.portHopping) {
          entry += `\n    ports: "${p.portHopping}"\n    hop-interval: 30`;
        }
        return entry;
      })
      .join("\n\n");

    const nodeNames = nodes.map((n) => `      - "${n.name}"`).join("\n");

    // 构建 rule-providers 和 rules
    const providers: string[] = [];
    const rules: string[] = [];

    // 自定义域名/IP 规则（优先级最高，排在分类规则之前）
    const customRulesList = meta?.customRules ?? [];
    if (customRulesList.length > 0) {
      rules.push(...renderSurgeStyleRules(customRulesList, "  - "));
    }

    for (const { rule, outbound } of resolved) {
      const catalog = RULE_SET_CATALOG[rule.rule_set_key];
      if (!catalog) continue;

      // 兜底规则
      if ("type" in catalog.singbox && catalog.singbox.type === "final") {
        rules.push(`  - MATCH,${outbound === "proxy" ? "Proxy" : outbound}`);
        continue;
      }

      // 私有地址 — Clash 通过内置 GEOIP 处理
      if (rule.rule_set_key === "private") {
        rules.push(`  - GEOIP,LAN,${outbound === "direct" ? "DIRECT" : outbound},no-resolve`);
        continue;
      }

      const clashOutbound = mapOutbound(outbound);

      if (!catalog.clash) continue;

      for (const provider of catalog.clash.providers) {
        // 注册 provider（去重由 name 保证）
        if (!providers.some((p) => p.includes(`${provider.name}:`))) {
          providers.push(`  ${provider.name}:
    type: http
    behavior: ${provider.behavior}
    url: "${provider.url}"
    path: ./ruleset/${provider.name}.yaml
    interval: 86400`);
        }
        rules.push(`  - RULE-SET,${provider.name},${clashOutbound}`);
      }
    }

    // 确保有兜底规则
    if (!rules.some((r) => r.includes("MATCH,"))) {
      rules.push("  - MATCH,Proxy");
    }

    const ruleProvidersSection = providers.length > 0
      ? `rule-providers:\n${providers.join("\n\n")}\n\n`
      : "";

    return `mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: true
unified-delay: true
tcp-concurrent: true

dns:
  enable: true
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  nameserver:
    - https://dns.google/dns-query
  fallback:
    - https://1.1.1.1/dns-query
  fallback-filter:
    geoip: true
    geoip-code: CN

proxies:
${proxies}

proxy-groups:
  - name: Proxy
    type: select
    proxies:
      - Auto
${nodeNames}
      - DIRECT

  - name: Auto
    type: url-test
    proxies:
${nodeNames}
    url: http://www.gstatic.com/generate_204
    interval: 300

${ruleProvidersSection}rules:
${rules.join("\n")}
`;
  },
};
