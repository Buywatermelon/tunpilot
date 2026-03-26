// Surge/Clash 格式共享的自定义规则渲染 (P2: 去重)
import type { CustomRule } from "../../db/schema";

const ACTION_MAP: Record<string, string> = {
  direct: "DIRECT",
  reject: "REJECT",
  proxy: "Proxy",
};

const TYPE_MAP: Record<string, string> = {
  domain: "DOMAIN",
  domain_suffix: "DOMAIN-SUFFIX",
  domain_keyword: "DOMAIN-KEYWORD",
  ip_cidr: "IP-CIDR",
};

/** 将自定义规则转为 Surge/Clash 格式的规则行 */
export function renderSurgeStyleRules(rules: CustomRule[], prefix = ""): string[] {
  const lines: string[] = [];
  for (const rule of rules) {
    const outbound = ACTION_MAP[rule.action] ?? "Proxy";
    const ruleType = TYPE_MAP[rule.type];
    if (!ruleType) continue;
    const suffix = rule.type === "ip_cidr" ? ",no-resolve" : "";
    lines.push(`${prefix}${ruleType},${rule.value},${outbound}${suffix}`);
  }
  return lines;
}
