import type { User, Node } from "../../db/schema";
import type { SubscriptionFormat, RenderMeta } from "./index";
import { buildProxyConfig, type ProxyConfig } from "./proxy";

function renderProxyLine(p: ProxyConfig): string {
  const parts = [
    `${p.name} = ${p.protocol}`,
    p.server,
    String(p.port),
    `password=${p.password}`,
    `sni=${p.sni}`,
  ];
  if (p.certFingerprint) {
    parts.push(`server-cert-fingerprint-sha256=${p.certFingerprint}`);
  }
  if (p.insecure) {
    parts.push("skip-cert-verify=true");
  }
  if (p.portHopping) {
    parts.push(`port-hopping=${p.portHopping.replace(/,/g, ";")}`, `port-hopping-interval=30`);
  }
  return parts.join(", ");
}

/**
 * Surge 外部代理列表格式：仅输出代理行。
 * 用户在自己的 Surge 配置中通过 policy-path 引用此 URL。
 */
export const surge: SubscriptionFormat = {
  name: "surge",
  contentType: "text/plain; charset=utf-8",
  render(user: User, nodes: Node[], _meta?: RenderMeta): string {
    const lines: string[] = [];
    for (const node of nodes) {
      lines.push(renderProxyLine(buildProxyConfig(node, user)));
    }
    return lines.join("\n") + "\n";
  },
};
