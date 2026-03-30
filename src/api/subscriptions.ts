import { Hono } from "hono";
import { getSubscription, deleteSubscription } from "../services/subscription";

type Db = Parameters<typeof deleteSubscription>[0];

export function createSubscriptionRoutes(db: Db): Hono {
  const app = new Hono();

  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const sub = getSubscription(db, id);
    if (!sub) return c.json({ error: "Subscription not found" }, 404);
    deleteSubscription(db, id);
    return c.body(null, 204);
  });

  return app;
}
