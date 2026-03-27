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
  obfs?: { type: "salamander"; password: string };
  portHopping?: string;
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

  if (node.obfs_password && node.protocol !== "trojan") {
    config.obfs = { type: "salamander", password: node.obfs_password };
  }

  if (node.port_hopping && node.protocol !== "trojan") {
    config.portHopping = node.port_hopping;
  }

  return config;
}
