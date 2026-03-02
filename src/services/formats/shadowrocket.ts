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

export const shadowrocket: SubscriptionFormat = {
  name: "shadowrocket",
  contentType: "text/plain; charset=utf-8",
  render(user: User, nodes: Node[], _meta?: RenderMeta): string {
    const lines = nodes.map((n) =>
      buildHy2Uri(user.password, n.host, n.port, n.sni, n.insecure, n.name)
    );
    return btoa(lines.join("\n"));
  },
};
