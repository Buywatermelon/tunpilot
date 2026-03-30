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
    setSetting(db, key, body.value);
    return c.json({ key, updated_at: new Date().toISOString() });
  });

  app.delete("/:key", (c) => {
    const key = c.req.param("key");
    deleteSetting(db, key);
    return c.body(null, 204);
  });

  app.onError((_, c) => c.json({ error: "Internal Server Error" }, 500));

  return app;
}
