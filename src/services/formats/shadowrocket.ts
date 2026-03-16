import type { User, Node } from "../../db/schema";
import type { SubscriptionFormat, RenderMeta } from "./index";

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
  const encodedPassword = encodeURIComponent(password);
  const encodedName = encodeURIComponent(name);
  return `hysteria2://${encodedPassword}@${host}:${port}/?sni=${serverName}&insecure=${insecureFlag}#${encodedName}`;
}

function buildTrojanUri(
  password: string,
  host: string,
  port: number,
  sni: string | null,
  insecure: number | null,
  name: string
): string {
  const serverName = sni || host;
  const encodedPassword = encodeURIComponent(password);
  const encodedName = encodeURIComponent(name);
  const params = [`sni=${serverName}`];
  if (insecure) {
    params.push("allowInsecure=1");
  }
  return `trojan://${encodedPassword}@${host}:${port}?${params.join("&")}#${encodedName}`;
}

function buildProxyUri(node: Node, password: string): string {
  if (node.protocol === "trojan") {
    // trojan:// URI has no standard cert fingerprint pinning param;
    // for self-signed certs, allowInsecure=1 is the only option
    return buildTrojanUri(password, node.host, node.port, node.sni, node.insecure, node.name);
  }
  return buildHy2Uri(password, node.host, node.port, node.sni, node.insecure, node.name);
}

export const shadowrocket: SubscriptionFormat = {
  name: "shadowrocket",
  contentType: "text/plain; charset=utf-8",
  render(user: User, nodes: Node[], _meta?: RenderMeta): string {
    const lines = nodes.map((n) => buildProxyUri(n, user.password));
    return btoa(lines.join("\n"));
  },
};
