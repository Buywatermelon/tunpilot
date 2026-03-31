import { Hono } from "hono";
import { listSettings, setSetting, deleteSetting } from "../services/settings";

type Db = Parameters<typeof listSettings>[0];

export function createSettingRoutes(db: Db): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    return c.json(listSettings(db));
  });

  app.put("/:key", async (c) => {
    const key = c.req.param("key");
    const body = await c.req.json();
    if (typeof body.value !== "string") return c.json({ error: "value must be a string" }, 400);
    const result = setSetting(db, key, body.value);
    return c.json(result);
  });

  app.delete("/:key", (c) => {
    const key = c.req.param("key");
    deleteSetting(db, key);
    return c.body(null, 204);
  });

  return app;
}
