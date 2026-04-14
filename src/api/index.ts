import { Hono } from "hono";
import type { Db } from "../db/index";
import { getConfig } from "../config";
import { createNodeRoutes } from "./nodes";
import { createUserRoutes } from "./users";
import { createSubscriptionRoutes } from "./subscriptions";
import { createMonitoringRoutes } from "./monitoring";
import { createSettingRoutes } from "./settings";
import { parseSqliteConstraintError } from "../lib/errors";

export function createApiApp(db: Db, baseUrl: string): Hono {
  const app = new Hono();
  const { authToken } = getConfig();

  // Access log middleware
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    const status = c.res.status;
    if (status >= 400) {
      console.log(`${c.req.method} ${c.req.path} ${status} ${ms}ms`);
    }
  });

  // Token auth middleware
  if (authToken) {
    app.use("*", async (c, next) => {
      const header = c.req.header("Authorization");
      if (header !== `Bearer ${authToken}`) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      await next();
    });
  }

  app.get("/info", (c) => c.json({ base_url: baseUrl }));

  app.route("/nodes", createNodeRoutes(db));
  app.route("/users", createUserRoutes(db, baseUrl));
  app.route("/subscriptions", createSubscriptionRoutes(db));
  app.route("/", createMonitoringRoutes(db));
  app.route("/settings", createSettingRoutes(db));

  // Global error handler
  app.onError((err, c) => {
    const constraint = parseSqliteConstraintError(err);
    if (constraint) return c.json({ error: constraint }, 409);

    console.error("API error:", err);
    return c.json({ error: "Internal Server Error" }, 500);
  });

  return app;
}
