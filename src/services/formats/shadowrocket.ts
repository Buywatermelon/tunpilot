import type { User, Node } from "../../db/schema";
import type { SubscriptionFormat, RenderMeta } from "./index";
import { buildProxyConfig, type ProxyConfig } from "./proxy";

/**
 * Shadowrocket 原生订阅格式：base64 编码的 URI 列表。
 * 每个节点一行 URI（hysteria2://、trojan:// 等），整体 base64 编码。
 */

function buildUri(p: ProxyConfig): string {
  if (p.protocol === "hysteria2") {
    const params = new URLSearchParams();
    params.set("peer", p.sni);
    if (p.insecure) params.set("insecure", "1");
    return `hysteria2://${encodeURIComponent(p.password)}@${p.server}:${p.port}?${params.toString()}#${encodeURIComponent(p.name)}`;
  }

  if (p.protocol === "trojan") {
    const params = new URLSearchParams();
    if (p.sni) params.set("sni", p.sni);
    if (p.insecure) params.set("allowInsecure", "1");
    if (p.certFingerprint) {
      params.set("fp", p.certFingerprint);
    }
    return `trojan://${encodeURIComponent(p.password)}@${p.server}:${p.port}?${params.toString()}#${encodeURIComponent(p.name)}`;
  }

  return "";
}

export const shadowrocket: SubscriptionFormat = {
  name: "shadowrocket",
  contentType: "text/plain; charset=utf-8",
  render(user: User, nodes: Node[], _meta?: RenderMeta): string {
    const uris: string[] = [];
    for (const node of nodes) {
      const uri = buildUri(buildProxyConfig(node, user));
      if (uri) uris.push(uri);
    }
    return Buffer.from(uris.join("\n")).toString("base64");
  },
};
