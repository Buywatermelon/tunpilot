import { Hono } from "hono";
import { listNodes, addNode, updateNode, removeNode, getNode } from "../services/node";
import { reconcileAllXrayNodes } from "../services/xray/sync";
import { reconcileAllHysteriaNodes } from "../services/hysteria/sync";

type Db = Parameters<typeof listNodes>[0];

export function createNodeRoutes(db: Db): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    return c.json(listNodes(db));
  });

  app.post("/", async (c) => {
    const body = await c.req.json();
    const node = addNode(db, body);
    return c.json(node, 201);
  });

  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const node = updateNode(db, id, body);
    if (!node) return c.json({ error: "Node not found" }, 404);
    return c.json(node);
  });

  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    removeNode(db, id);
    return c.body(null, 204);
  });

  app.post("/sync", async (c) => {
    const [xrayResults, hy2Results] = await Promise.all([
      reconcileAllXrayNodes(db),
      reconcileAllHysteriaNodes(db),
    ]);
    return c.json({ synced: xrayResults.length + hy2Results.length });
  });

  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const node = getNode(db, id);
    if (!node) return c.json({ error: "Node not found" }, 404);
    return c.json(node);
  });

  return app;
}
