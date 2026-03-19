import type { User, Node } from "../../db/schema";
import type { SubscriptionFormat, RenderMeta } from "./index";
import { RULE_SET_CATALOG } from "../routing/catalog";
import { resolveAllRules } from "../routing/resolve";

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

    // [General]
    lines.push("[General]");
    lines.push("loglevel = notify");
    lines.push("skip-proxy = 127.0.0.1, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10, localhost, *.local");
    lines.push("");

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
