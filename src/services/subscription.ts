import { eq } from "drizzle-orm";
import type { Db } from "../db/index";
import { subscriptions, type Subscription, type User, type Node } from "../db/schema";
import { getUser, getUserNodes } from "./user";

export interface SubscriptionWithUrl extends Subscription {
  url?: string;
}

export interface SubscriptionConfig {
  content: string;
  contentType: string;
}

// 生成订阅链接
export function generateSubscription(
  db: Db,
  userId: string,
  format: string,
  baseUrl?: string
): SubscriptionWithUrl {
  const sub = db
    .insert(subscriptions)
    .values({ user_id: userId, format })
    .returning()
    .get() as SubscriptionWithUrl;

  if (baseUrl) {
    sub.url = `${baseUrl}/sub/${sub.token}`;
  }
  return sub;
}

// 列出用户的所有订阅
export function listSubscriptions(db: Db, userId: string): Subscription[] {
  return db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.user_id, userId))
    .all();
}

// 删除订阅（撤销 token）
export function deleteSubscription(db: Db, id: string): void {
  db.delete(subscriptions).where(eq(subscriptions.id, id)).run();
}

// 根据 token 获取订阅
export function getSubscriptionByToken(db: Db, token: string): Subscription | null {
  return (
    db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.token, token))
      .get() ?? null
  );
}

// 获取订阅配置内容（根据格式渲染）
export function getSubscriptionConfig(
  db: Db,
  token: string
): SubscriptionConfig | null {
  const sub = getSubscriptionByToken(db, token);
  if (!sub) return null;

  const user = getUser(db, sub.user_id);
  if (!user) return null;

  const nodes = getUserNodes(db, user.id).filter((n) => n.enabled === 1);

  switch (sub.format) {
    case "shadowrocket":
      return {
        content: renderShadowrocket(user, nodes),
        contentType: "text/plain; charset=utf-8",
      };
    case "singbox":
      return {
        content: JSON.stringify(renderSingbox(user, nodes)),
        contentType: "application/json",
      };
    case "clash":
      return {
        content: renderClash(user, nodes),
        contentType: "text/yaml; charset=utf-8",
      };
    default:
      return null;
  }
}

// --- 渲染函数（纯函数，不涉及 DB 操作） ---

function buildHy2Uri(
  password: string,
  host: string,
  port: number,
  sni: string | null,
  insecure: number | null,
  name: string
): string {
  const serverName = sni || host;
  const insecureFlag = insecure ? 1 : 0;
  return `hysteria2://${password}@${host}:${port}/?sni=${serverName}&insecure=${insecureFlag}#${name}`;
}

// 渲染 Shadowrocket 格式（Base64 编码的 URI 列表）
export function renderShadowrocket(user: User, nodes: Node[]): string {
  const lines = nodes.map((n) =>
    buildHy2Uri(user.password, n.host, n.port, n.sni, n.insecure, n.name)
  );
  return btoa(lines.join("\n"));
}

// 渲染 Sing-box JSON 配置
export function renderSingbox(user: User, nodes: Node[]): any {
  const nodeNames = nodes.map((n) => n.name);

  const hy2Outbounds = nodes.map((n) => ({
    type: "hysteria2",
    tag: n.name,
    server: n.host,
    server_port: n.port,
    password: user.password,
    tls: {
      enabled: true,
      server_name: n.sni || n.host,
      ...(n.insecure ? { insecure: true } : {}),
    },
  }));

  return {
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
        inet4_address: "172.19.0.1/30",
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
      ...hy2Outbounds,
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
  };
}

// 渲染 Clash YAML 配置
export function renderClash(user: User, nodes: Node[]): string {
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

dns:
  enable: true
  enhanced-mode: fake-ip
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
}

export type { Subscription } from "../db/schema";
