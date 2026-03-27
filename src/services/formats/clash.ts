import type { User, Node } from "../../db/schema";
import type { SubscriptionFormat, RenderMeta } from "./index";
import { buildProxyConfig } from "./proxy";

/**
 * Clash proxy-provider 格式：仅输出 proxies 数组。
 * 用户在自己的 Clash 配置中通过 proxy-providers 引用此 URL。
 */
export const clash: SubscriptionFormat = {
  name: "clash",
  contentType: "text/yaml; charset=utf-8",

  render(user: User, nodes: Node[], _meta?: RenderMeta): string {
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
        if (p.portHopping) {
          entry += `\n    ports: "${p.portHopping}"\n    hop-interval: 30`;
        }
        return entry;
      })
      .join("\n\n");

    return `proxies:\n${proxies}\n`;
  },
};
