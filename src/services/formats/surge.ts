import type { User, Node } from "../../db/schema";
import type { SubscriptionFormat, RenderMeta } from "./index";
import { RULE_SET_CATALOG } from "../routing/catalog";
import { resolveAllRules } from "../routing/resolve";
import { renderSurgeStyleRules } from "./custom-rule-utils";

function renderProxyLine(node: Node, password: string): string {
  const sni = node.sni || node.host;
  const type = node.protocol === "trojan" ? "trojan" : "hysteria2";
  const parts = [
    `${node.name} = ${type}`,
    node.host,
    String(node.port),
    `password=${password}`,
    `sni=${sni}`,
  ];
  if (node.cert_fingerprint && node.protocol === "trojan") {
    parts.push(`server-cert-fingerprint-sha256=${node.cert_fingerprint}`);
  }
  if (node.insecure === 1) {
    parts.push("skip-cert-verify=true");
  }
  if (node.obfs_password && node.protocol !== "trojan") {
    parts.push(`obfs=salamander`, `obfs-password=${node.obfs_password}`);
  }
  return parts.join(", ");
}

export const surge: SubscriptionFormat = {
  name: "surge",
  contentType: "text/plain; charset=utf-8",
  render(user: User, nodes: Node[], meta?: RenderMeta): string {
    const routingRules = meta?.routingRules ?? [];
    const allNodes = meta?.allNodes ?? nodes;
    const resolved = resolveAllRules(routingRules, nodes, allNodes);

    const lines: string[] = [];

    // Managed config header
    if (meta?.subscriptionUrl) {
      lines.push(`#!MANAGED-CONFIG ${meta.subscriptionUrl} interval=86400 strict=false`);
      lines.push("");
    }

    // 从自定义 DIRECT 规则中提取域名，用于 skip-proxy 和 always-real-ip
    const customRules = meta?.customRules ?? [];
    const directDomains: string[] = [];
    for (const r of customRules) {
      if (r.action !== "direct") continue;
      if (r.type === "domain") directDomains.push(r.value);
      else if (r.type === "domain_suffix") directDomains.push(`*.${r.value}`, r.value);
    }

    const s = meta?.settings ?? {};

    // [General]
    lines.push("[General]");
    lines.push("loglevel = notify");
    const skipProxy = ["127.0.0.1", "192.168.0.0/16", "10.0.0.0/8", "172.16.0.0/12", "100.64.0.0/10", "localhost", "*.local", ...directDomains];
    lines.push(`skip-proxy = ${skipProxy.join(", ")}`);
    if (directDomains.length > 0) {
      lines.push(`always-real-ip = ${directDomains.join(", ")}`);
    }
    if (s.surge_tun_excluded_routes) {
      lines.push(`tun-excluded-routes = ${s.surge_tun_excluded_routes}`);
    }
    if (s.surge_dns_servers) {
      lines.push(`dns-server = ${s.surge_dns_servers}`);
    }
    lines.push("");

    // [Host] — 从 settings 读取自定义 DNS 分流（如 Tailscale MagicDNS）
    if (s.surge_host_rules) {
      lines.push("[Host]");
      for (const line of s.surge_host_rules.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) lines.push(trimmed);
      }
      lines.push("");
    }

    // [Proxy]
    lines.push("[Proxy]");
    lines.push("DIRECT = direct");
    for (const node of nodes) {
      lines.push(renderProxyLine(node, user.password));
    }
    lines.push("");

    // [Proxy Group]
    const nodeNames = nodes.map((n) => n.name);
    lines.push("[Proxy Group]");
    lines.push(`Proxy = select, Auto, ${nodeNames.join(", ")}, DIRECT`);
    lines.push(`Auto = url-test, ${nodeNames.join(", ")}, url=http://www.gstatic.com/generate_204, interval=300, tolerance=50`);
    lines.push("");

    // [Rule] — 动态生成
    lines.push("[Rule]");

    // 自定义域名/IP 规则（优先级最高，排在分类规则之前）
    if (customRules.length > 0) {
      lines.push(...renderSurgeStyleRules(customRules));
    }

    for (const { rule, outbound } of resolved) {
      const catalog = RULE_SET_CATALOG[rule.rule_set_key];
      if (!catalog) continue;

      const surgeOutbound = outbound === "direct"
        ? "DIRECT"
        : outbound === "reject"
          ? "REJECT"
          : outbound === "proxy"
            ? "Proxy"
            : outbound;

      // 兜底
      if ("type" in catalog.singbox && catalog.singbox.type === "final") {
        lines.push(`FINAL,${surgeOutbound}`);
        continue;
      }

      // 私有地址
      if (rule.rule_set_key === "private") {
        lines.push(`GEOIP,LAN,${surgeOutbound},no-resolve`);
        continue;
      }

      if (!catalog.surge) continue;

      for (const ruleTemplate of catalog.surge.rules) {
        lines.push(ruleTemplate.replace("{outbound}", surgeOutbound));
      }
    }

    // 确保有兜底
    if (!lines.some((l) => l.startsWith("FINAL,"))) {
      lines.push("FINAL,Proxy");
    }

    lines.push("");
    return lines.join("\n");
  },
};
