import { Hono } from "hono";
import type { Db } from "../db/index";
import { authenticate } from "../services/auth";
import { getUser, getUserNodes } from "../services/user";
import { getSubscriptionByToken } from "../services/subscription";
import { getFormat } from "../services/formats/index";

export function createHttpApp(db: Db, baseUrl: string): Hono {
  const app = new Hono();

  // Hysteria2 节点认证回调
  app.post("/auth/:nodeId/:authSecret", async (c) => {
    let password = "";
    try {
      const body = await c.req.json();
      password = body.auth || "";
    } catch {
      return c.json({ ok: false });
    }

    if (!password) {
      return c.json({ ok: false });
    }

    const { nodeId, authSecret } = c.req.param();
    const result = authenticate(db, nodeId, authSecret, password);
    return c.json(result);
  });

  // 订阅链接下载
  app.get("/sub/:token", (c) => {
    const { token } = c.req.param();
    const sub = getSubscriptionByToken(db, token);
    if (!sub) return c.notFound();

    const format = getFormat(sub.format);
    if (!format) return c.notFound();

    const user = getUser(db, sub.user_id);
    if (!user) return c.notFound();

    const nodes = getUserNodes(db, user.id).filter((n) => n.enabled);
    const subscriptionUrl = `${baseUrl}/sub/${token}`;
    const content = format.render(user, nodes, { subscriptionUrl });

    return new Response(content, {
      headers: { "Content-Type": format.contentType },
    });
  });

  // 健康检查
  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return app;
}
