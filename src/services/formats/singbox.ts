import type { User, Node } from "../../db/schema";
import type { SubscriptionFormat, RenderMeta } from "./index";
import { buildProxyConfig } from "./proxy";

/**
 * sing-box outbound provider 格式：仅输出 outbounds 数组。
 * 用户在自己的 sing-box 配置中通过 outbound_providers 引用此 URL。
 */
export const singbox: SubscriptionFormat = {
  name: "singbox",
  contentType: "application/json",

  render(user: User, nodes: Node[], _meta?: RenderMeta): string {
    const outbounds = nodes.map((n) => {
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
      return hy2;
    });

    return JSON.stringify({ outbounds });
  },
};
