import { Hono } from "hono";
import type { Db } from "../db/index";
import { getSubscriptionConfig } from "../services/subscription";
import { getAllCircuitStates } from "../lib/circuit-breaker";

export function createHttpApp(db: Db, baseUrl: string): Hono {
  const app = new Hono();

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
