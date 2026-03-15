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
      log: { level: "info", timestamp: true },
      dns: {
        servers: [
          { type: "https", tag: "dns-remote", server: "dns.google", server_port: 443, path: "/dns-query", domain_resolver: "dns-direct" },
          { type: "udp", tag: "dns-direct", server: "223.5.5.5", server_port: 53, detour: "direct" },
        ],
        rules: [
          { rule_set: "geosite-cn", server: "dns-direct" },
        ],
        final: "dns-remote",
        strategy: "prefer_ipv4",
        independent_cache: true,
      },
      inbounds: [
        {
          type: "tun",
          tag: "tun-in",
          address: ["172.19.0.1/30", "fdfe:dcba:9876::1/126"],
          auto_route: true,
          strict_route: true,
          stack: "mixed",
        },
        {
          type: "mixed",
          tag: "mixed-in",
          listen: "127.0.0.1",
          listen_port: 2080,
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
          url: "https://www.gstatic.com/generate_204",
          interval: "5m",
        },
        ...proxyOutbounds,
        { type: "direct", tag: "direct" },
      ],
      route: {
        rules: [
          { action: "sniff" },
          { protocol: "dns", action: "hijack-dns" },
          { ip_is_private: true, outbound: "direct" },
          { rule_set: ["geosite-cn", "geoip-cn"], outbound: "direct" },
          { rule_set: ["geosite-category-ads-all"], action: "reject" },
        ],
        rule_set: [
          {
            type: "remote",
            tag: "geosite-cn",
            format: "binary",
            url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs",
            download_detour: "direct",
            update_interval: "1d",
          },
          {
            type: "remote",
            tag: "geoip-cn",
            format: "binary",
            url: "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs",
            download_detour: "direct",
            update_interval: "1d",
          },
          {
            type: "remote",
            tag: "geosite-category-ads-all",
            format: "binary",
            url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-ads-all.srs",
            download_detour: "direct",
            update_interval: "1d",
          },
        ],
        auto_detect_interface: true,
        default_domain_resolver: "dns-direct",
        final: "proxy",
      },
      experimental: {
        cache_file: {
          enabled: true,
          store_rdrc: true,
        },
        clash_api: {
          external_controller: "127.0.0.1:12081",
        },
      },
    };

    return JSON.stringify(config);
  },
};
