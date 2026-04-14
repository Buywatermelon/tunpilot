import { Hono } from "hono";
import { listUsers, createUser, getUser, getUserNodes, assignNodesToUser } from "../services/user";
import {
  updateUserWithSync,
  deleteUserWithSync,
  resetTrafficWithSync,
  assignNodesWithSync,
  addNodeWithSync,
  removeNodeWithSync,
  syncNodesByIds,
} from "../services/user-ops";
import { listNodes } from "../services/node";
import { generateSubscription, listSubscriptions } from "../services/subscription";
import { parseSqliteConstraintError } from "../lib/errors";

type Db = Parameters<typeof listUsers>[0];

export function createUserRoutes(db: Db, baseUrl: string): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    return c.json(listUsers(db));
  });

  app.post("/", async (c) => {
    const body = await c.req.json();
    const { nodes: nodesParam, subscribe, ...userParams } = body;

    let user;
    try {
      user = createUser(db, userParams);
    } catch (err: unknown) {
      const constraint = parseSqliteConstraintError(err);
      if (constraint) return c.json({ error: constraint }, 409);
      throw err;
    }

    if (!nodesParam && !subscribe) {
      return c.json(user, 201);
    }

    // DB node assignment (fast), then respond immediately
    let assignedNodeIds: string[] = [];
    if (nodesParam) {
      const nodeIds = nodesParam === "all"
        ? listNodes(db).map((n) => n.id)
        : nodesParam as string[];
      assignNodesToUser(db, user.id, nodeIds);
      assignedNodeIds = nodeIds;
    }

    let subscription;
    if (subscribe) {
      subscription = generateSubscription(db, user.id, subscribe, baseUrl);
    }

    // Fire-and-forget: sync to nodes in background (don't block response)
    if (assignedNodeIds.length > 0) {
      syncNodesByIds(db, assignedNodeIds).catch((err) =>
        console.warn(`Background sync errors for new user ${user.id}:`, err)
      );
    }

    return c.json({ user, nodes: assignedNodeIds, subscription }, 201);
  });

  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const user = getUser(db, id);
    if (!user) return c.json({ error: "User not found" }, 404);
    return c.json(user);
  });

  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const user = await updateUserWithSync(db, id, body);
    if (!user) return c.json({ error: "User not found" }, 404);
    return c.json(user);
  });

  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const user = getUser(db, id);
    if (!user) return c.json({ error: "User not found" }, 404);
    await deleteUserWithSync(db, id);
    return c.body(null, 204);
  });

  app.post("/:id/reset-traffic", async (c) => {
    const id = c.req.param("id");
    const user = getUser(db, id);
    if (!user) return c.json({ error: "User not found" }, 404);
    await resetTrafficWithSync(db, id);
    return c.json({});
  });

  app.get("/:id/nodes", (c) => {
    const id = c.req.param("id");
    return c.json(getUserNodes(db, id));
  });

  app.put("/:id/nodes", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    await assignNodesWithSync(db, id, body.node_ids);
    return c.json({ assigned: body.node_ids });
  });

  app.post("/:id/nodes", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const result = await addNodeWithSync(db, id, body.node_id);
    return c.json({ added: result.added });
  });

  app.delete("/:id/nodes/:nodeId", async (c) => {
    const id = c.req.param("id");
    const nodeId = c.req.param("nodeId");
    const result = await removeNodeWithSync(db, id, nodeId);
    return c.json({ removed: result.removed });
  });

  app.post("/:id/subscriptions", async (c) => {
    const id = c.req.param("id");
    const user = getUser(db, id);
    if (!user) return c.json({ error: "User not found" }, 404);
    const body = await c.req.json();
    const sub = generateSubscription(db, id, body.format, baseUrl);
    return c.json(sub, 201);
  });

  app.get("/:id/subscriptions", (c) => {
    const id = c.req.param("id");
    return c.json(listSubscriptions(db, id));
  });

  return app;
}
