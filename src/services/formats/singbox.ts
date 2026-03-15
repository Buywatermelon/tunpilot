import type { User, Node } from "../../db/schema";
import type { SubscriptionFormat, RenderMeta } from "./index";

export const singbox: SubscriptionFormat = {
  name: "singbox",
  contentType: "application/json",

  render(user: User, nodes: Node[], _meta?: RenderMeta): string {
    const nodeNames = nodes.map((n) => n.name);

    const proxyOutbounds = nodes.map((n) => {
      const tls: Record<string, unknown> = {
        enabled: true,
        server_name: n.sni || n.host,
      };
      if (n.cert_fingerprint && n.protocol === "trojan") {
        tls.certificate = [`sha256/${n.cert_fingerprint}`];
      } else if (n.insecure) {
        tls.insecure = true;
      }
      if (n.protocol === "trojan") {
        return { type: "trojan" as const, tag: n.name, server: n.host, server_port: n.port, password: user.password, tls };
      }
      return { type: "hysteria2" as const, tag: n.name, server: n.host, server_port: n.port, password: user.password, tls };
    });

    const config = {
      log: { level: "info" },
      dns: {
        servers: [
          { tag: "google", address: "https://dns.google/dns-query" },
          { tag: "local", address: "223.5.5.5", detour: "direct" },
        ],
        rules: [{ rule_set: "geosite-cn", server: "local" }],
      },
      inbounds: [
        {
          type: "tun",
          tag: "tun-in",
          address: ["172.19.0.1/30"],
          auto_route: true,
          strict_route: true,
          stack: "system",
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
          interval: "5m",
        },
        ...proxyOutbounds,
        { type: "direct", tag: "direct" },
        { type: "block", tag: "block" },
        { type: "dns", tag: "dns-out" },
      ],
      route: {
        rules: [
          { protocol: "dns", outbound: "dns-out" },
          { rule_set: ["geosite-cn", "geoip-cn"], outbound: "direct" },
          { rule_set: ["geosite-category-ads-all"], outbound: "block" },
        ],
        rule_set: [
          {
            type: "remote",
            tag: "geosite-cn",
            format: "binary",
            url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs",
            download_detour: "direct",
          },
          {
            type: "remote",
            tag: "geoip-cn",
            format: "binary",
            url: "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs",
            download_detour: "direct",
          },
          {
            type: "remote",
            tag: "geosite-category-ads-all",
            format: "binary",
            url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-ads-all.srs",
            download_detour: "direct",
          },
        ],
        auto_detect_interface: true,
      },
      experimental: {
        clash_api: {
          external_controller: "127.0.0.1:9090",
          external_ui: "ui",
          default_mode: "rule",
        },
      },
    };

    return JSON.stringify(config);
  },
};
