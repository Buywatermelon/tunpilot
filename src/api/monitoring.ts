import { Hono } from "hono";
import { getNodeHealthStatuses } from "../services/health";
import { getAggregatedTrafficStats } from "../services/traffic";

type Db = Parameters<typeof getAggregatedTrafficStats>[0];

export function createMonitoringRoutes(db: Db): Hono {
  const app = new Hono();

  app.get("/health", async (c) => {
    const nodes = await getNodeHealthStatuses(db);
    return c.json({ nodes });
  });

  app.get("/traffic", (c) => {
    const userId = c.req.query("user_id");
    const nodeId = c.req.query("node_id");
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (from && isNaN(Date.parse(from))) return c.json({ error: "Invalid 'from' date" }, 400);
    if (to && isNaN(Date.parse(to))) return c.json({ error: "Invalid 'to' date" }, 400);
    const filters = { userId, nodeId, from, to };
    const stats = getAggregatedTrafficStats(db, filters);
    return c.json(stats);
  });

  return app;
}
