import { Hono } from "hono";
import { deleteSubscription } from "../services/subscription";

type Db = Parameters<typeof deleteSubscription>[0];

export function createSubscriptionRoutes(db: Db): Hono {
  const app = new Hono();

  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    deleteSubscription(db, id);
    return c.body(null, 204);
  });

  app.onError((_, c) => c.json({ error: "Internal Server Error" }, 500));

  return app;
}
