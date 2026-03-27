import { Hono } from "hono";
import type { Db } from "../db/index";
import { authenticate } from "../services/auth";
import { getSubscriptionConfig } from "../services/subscription";
import { getAllCircuitStates } from "../lib/circuit-breaker";

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
    const config = getSubscriptionConfig(db, token, baseUrl);
    if (!config) return c.notFound();

    return new Response(config.content, {
      headers: { "Content-Type": config.contentType },
    });
  });

  // 健康检查
  app.get("/health", (c) => {
    const circuits = getAllCircuitStates();
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      circuits: Object.keys(circuits).length > 0 ? circuits : undefined,
    });
  });

  return app;
}
