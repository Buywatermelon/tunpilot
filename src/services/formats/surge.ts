import type { User, Node } from "../../db/schema";
import type { SubscriptionFormat, RenderMeta } from "./index";

function renderProxyLine(node: Node, password: string): string {
  const sni = node.sni || node.host;
  const parts = [
    `${node.name} = hysteria2`,
    node.host,
    String(node.port),
    `password=${password}`,
    `sni=${sni}`,
  ];
  if (node.insecure === 1) {
    parts.push("skip-cert-verify=true");
  }
  return parts.join(", ");
}

export const surge: SubscriptionFormat = {
  name: "surge",
  contentType: "text/plain; charset=utf-8",
  render(user: User, nodes: Node[], meta?: RenderMeta): string {
    const lines: string[] = [];

    // Managed config header
    if (meta?.subscriptionUrl) {
      lines.push(`#!MANAGED-CONFIG ${meta.subscriptionUrl} interval=86400 strict=false`);
      lines.push("");
    }

    // [General]
    lines.push("[General]");
    lines.push("loglevel = notify");
    lines.push("skip-proxy = 127.0.0.1, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10, localhost, *.local");
    lines.push("");

    // [Proxy]
    lines.push("[Proxy]");
    lines.push("DIRECT = direct");
    for (const node of nodes) {
      lines.push(renderProxyLine(node, user.password));
    }
    lines.push("");

    // [Proxy Group]
    const nodeNames = nodes.map((n) => n.name);
    lines.push("[Proxy Group]");
    lines.push(`Proxy = select, Auto, ${nodeNames.join(", ")}, DIRECT`);
    lines.push(`Auto = url-test, ${nodeNames.join(", ")}, url=http://www.gstatic.com/generate_204, interval=300, tolerance=50`);
    lines.push("");

    // [Rule]
    lines.push("[Rule]");
    lines.push("GEOIP,CN,DIRECT");
    lines.push("FINAL,Proxy");
    lines.push("");

    return lines.join("\n");
  },
};
