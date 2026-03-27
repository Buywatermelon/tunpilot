import type { Node, User } from "../../db/schema";

export interface ProxyConfig {
  name: string;
  protocol: "hysteria2" | "trojan";
  server: string;
  port: number;
  password: string;
  sni: string;
  insecure: boolean;
  certFingerprint?: string;
}

export function buildProxyConfig(node: Node, user: User): ProxyConfig {
  const config: ProxyConfig = {
    name: node.name,
    protocol: node.protocol === "trojan" ? "trojan" : "hysteria2",
    server: node.host,
    port: node.port,
    password: node.protocol === "hysteria2"
      ? `${user.name}:${user.password}`
      : user.password,
    sni: node.sni || node.host,
    insecure: node.insecure === 1,
  };

  if (node.cert_fingerprint && node.protocol === "trojan") {
    config.certFingerprint = node.cert_fingerprint;
  }

  return config;
}
