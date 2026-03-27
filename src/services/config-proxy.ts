import type { Db } from "../db/index";
import { getSubscriptionByToken } from "./subscription";
import { getUser, getUserNodes } from "./user";
import { getSetting } from "./settings";
import { buildProxyConfig, type ProxyConfig } from "./formats/proxy";

// Gist 模板缓存（1 小时 TTL）
let cachedTemplate: string | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 3600_000;

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
  return parts.join(", ");
}

async function fetchTemplate(url: string): Promise<string> {
  if (cachedTemplate && Date.now() < cacheExpiry) {
    return cachedTemplate;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch template: ${res.status}`);
  }
  cachedTemplate = await res.text();
  cacheExpiry = Date.now() + CACHE_TTL;
  return cachedTemplate;
}

export async function getSurgeConfig(
  db: Db,
  token: string
): Promise<{ content: string; error?: string } | null> {
  const sub = getSubscriptionByToken(db, token);
  if (!sub) return null;

  const user = getUser(db, sub.user_id);
  if (!user) return null;

  const nodes = getUserNodes(db, user.id).filter((n) => n.enabled === 1);

  const gistUrl = getSetting(db, "surge_config_gist_url");
  if (!gistUrl) {
    return { content: "", error: "surge_config_gist_url not configured" };
  }

  const template = await fetchTemplate(gistUrl);

  const proxyLines = nodes.map((n) => renderProxyLine(buildProxyConfig(n, user)));
  const nodeNames = nodes.map((n) => n.name);

  const content = template
    .replace(/\{\{PROXIES\}\}/g, proxyLines.join("\n"))
    .replace(/\{\{NODE_LIST\}\}/g, nodeNames.join(", "));

  return { content };
}
