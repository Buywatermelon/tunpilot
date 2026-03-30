import { Hono } from "hono";
import { listNodes } from "../services/node";
import { getAggregatedTrafficStats } from "../services/traffic";

type Db = Parameters<typeof listNodes>[0];

export function createMonitoringRoutes(db: Db): Hono {
  const app = new Hono();

  app.get("/health", (c) => {
    const allNodes = listNodes(db);
    const nodes = allNodes.map((n) => ({
      id: n.id,
      name: n.name,
      status: n.enabled === 1 ? "online" : "disabled",
    }));
    return c.json({ nodes });
  });

  app.get("/traffic", (c) => {
    const userId = c.req.query("user_id");
    const nodeId = c.req.query("node_id");
    const from = c.req.query("from");
    const to = c.req.query("to");
    const filters = { userId, nodeId, from, to };
    const stats = getAggregatedTrafficStats(db, filters);
    return c.json(stats);
  });

  app.onError((_, c) => c.json({ error: "Internal Server Error" }, 500));

  return app;
}
