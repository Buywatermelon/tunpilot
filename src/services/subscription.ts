import type { Database } from "bun:sqlite";
import type { User } from "./user.ts";
import type { Node } from "./node.ts";
import { getUser, getUserNodes } from "./user.ts";

export interface Subscription {
  id: string;
  user_id: string;
  token: string;
  format: string;
  created_at: string;
}

export interface SubscriptionWithUrl extends Subscription {
  url?: string;
}

export function generateSubscription(
  db: Database,
  userId: string,
  format: string,
  baseUrl?: string
): SubscriptionWithUrl {
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  db.prepare(
    "INSERT INTO subscriptions (id, user_id, token, format) VALUES (?, ?, ?, ?)"
  ).run(id, userId, token, format);
  const sub = db
    .query("SELECT * FROM subscriptions WHERE id = ?")
    .get(id) as SubscriptionWithUrl;
  if (baseUrl) {
    sub.url = `${baseUrl}/sub/${token}`;
  }
  return sub;
}

export function listSubscriptions(
  db: Database,
  userId: string
): Subscription[] {
  return db
    .query("SELECT * FROM subscriptions WHERE user_id = ?")
    .all(userId) as Subscription[];
}

export function getSubscriptionByToken(
  db: Database,
  token: string
): Subscription | null {
  return (
    (db
      .query("SELECT * FROM subscriptions WHERE token = ?")
      .get(token) as Subscription) ?? null
  );
}

export interface SubscriptionConfig {
  content: string;
  contentType: string;
}

export function getSubscriptionConfig(
  db: Database,
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

function buildHy2Uri(
  password: string,
  host: string,
  port: number,
  sni: string | null,
  name: string
): string {
  const serverName = sni || host;
  return `hysteria2://${password}@${host}:${port}/?sni=${serverName}&insecure=0#${name}`;
}

export function renderShadowrocket(user: User, nodes: Node[]): string {
  const lines = nodes.map((n) =>
    buildHy2Uri(user.password, n.host, n.port, n.sni, n.name)
  );
  return btoa(lines.join("\n"));
}

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
    },
  }));

  return {
    log: { level: "info" },
    dns: {
      servers: [
        { tag: "google", address: "https://dns.google/dns-query" },
        { tag: "local", address: "223.5.5.5", detour: "direct" },
      ],
      rules: [{ geosite: "cn", server: "local" }],
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
        { geosite: "cn", geoip: "cn", outbound: "direct" },
        { geosite: "category-ads-all", outbound: "block" },
      ],
      auto_detect_interface: true,
    },
  };
}

export function renderClash(user: User, nodes: Node[]): string {
  const proxies = nodes
    .map((n) => {
      const sni = n.sni || n.host;
      return `  - name: "${n.name}"
    type: hysteria2
    server: ${n.host}
    port: ${n.port}
    password: "${user.password}"
    sni: ${sni}`;
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
