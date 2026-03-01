import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import { authenticate } from "../services/auth";
import { getUser, getUserNodes } from "../services/user";
import {
  getSubscriptionByToken,
  renderShadowrocket,
  renderSingbox,
  renderClash,
} from "../services/subscription";

export function createHttpApp(db: Database, _baseUrl: string): Hono {
  const app = new Hono();

  // Auth callback — Hysteria2 nodes POST here
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

  // Subscription download
  app.get("/sub/:token", (c) => {
    const { token } = c.req.param();
    const sub = getSubscriptionByToken(db, token);
    if (!sub) {
      return c.notFound();
    }

    const user = getUser(db, sub.user_id);
    if (!user) {
      return c.notFound();
    }

    const nodes = getUserNodes(db, user.id).filter((n) => n.enabled);

    switch (sub.format) {
      case "shadowrocket": {
        const body = renderShadowrocket(user, nodes);
        return new Response(body, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      case "singbox": {
        const config = renderSingbox(user, nodes);
        return c.json(config);
      }
      case "clash": {
        const yaml = renderClash(user, nodes);
        return new Response(yaml, {
          headers: { "Content-Type": "text/yaml; charset=utf-8" },
        });
      }
      default:
        return c.notFound();
    }
  });

  // Health probe
  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return app;
}
