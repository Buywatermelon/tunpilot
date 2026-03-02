import type { User, Node } from "../../db/schema";
import type { SubscriptionFormat, RenderMeta } from "./index";

export const clash: SubscriptionFormat = {
  name: "clash",
  contentType: "text/yaml; charset=utf-8",

  render(user: User, nodes: Node[], _meta?: RenderMeta): string {
    const proxies = nodes
      .map((n) => {
        const sni = n.sni || n.host;
        let entry = `  - name: "${n.name}"
    type: hysteria2
    server: ${n.host}
    port: ${n.port}
    password: "${user.password}"
    sni: ${sni}`;
        if (n.insecure) entry += `\n    skip-cert-verify: true`;
        return entry;
      })
      .join("\n\n");

    const nodeNames = nodes.map((n) => `      - ${n.name}`).join("\n");

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

rules:
  - GEOSITE,category-ads-all,REJECT
  - GEOIP,CN,DIRECT
  - GEOSITE,CN,DIRECT
  - MATCH,Proxy
`;
  },
};
