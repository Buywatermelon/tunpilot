import { test, expect, beforeEach, afterEach, describe } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase } from "../db/index";
import { addNode } from "./node";
import { createUser } from "./user";
import {
  syncTrafficFromNode,
  syncAllNodes,
  getTrafficStats,
  startTrafficSync,
} from "./traffic";
import type { Node } from "./node";

let db: Database;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  db = initDatabase(":memory:");
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createNodeWithStats(
  overrides: Partial<Parameters<typeof addNode>[1]> = {}
): Node {
  return addNode(db, {
    name: overrides.name ?? "tokyo-1",
    host: overrides.host ?? "203.0.113.1",
    port: overrides.port ?? 443,
    protocol: overrides.protocol ?? "hysteria2",
    stats_port: overrides.stats_port ?? 9090,
    stats_secret: overrides.stats_secret ?? "secret123",
    ...overrides,
  });
}

describe("syncTrafficFromNode", () => {
  test("fetches traffic data and writes to traffic_logs and updates used_bytes", async () => {
    const node = createNodeWithStats();
    const user = createUser(db, { name: "alice", password: "pass" });

    globalThis.fetch = async (url, opts) => {
      expect(String(url)).toBe(`http://${node.host}:${node.stats_port}/traffic?clear=1`);
      expect((opts?.headers as Record<string, string>)?.["Authorization"]).toBe(
        node.stats_secret
      );
      return new Response(
        JSON.stringify({ alice: { tx: 1000, rx: 2000 } })
      );
    };

    const result = await syncTrafficFromNode(db, node);

    expect(result.nodeId).toBe(node.id);
    expect(result.synced).toBe(1);
    expect(result.errors).toEqual([]);

    // Check traffic_logs
    const logs = db
      .query("SELECT * FROM traffic_logs WHERE user_id = ? AND node_id = ?")
      .all(user.id, node.id) as any[];
    expect(logs).toHaveLength(1);
    expect(logs[0].tx_bytes).toBe(1000);
    expect(logs[0].rx_bytes).toBe(2000);

    // Check user used_bytes incremented
    const updatedUser = db
      .query("SELECT used_bytes FROM users WHERE id = ?")
      .get(user.id) as any;
    expect(updatedUser.used_bytes).toBe(3000);
  });

  test("handles multiple users in a single response", async () => {
    const node = createNodeWithStats();
    const alice = createUser(db, { name: "alice", password: "pass" });
    const bob = createUser(db, { name: "bob", password: "pass" });

    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          alice: { tx: 100, rx: 200 },
          bob: { tx: 500, rx: 600 },
        })
      );
    };

    const result = await syncTrafficFromNode(db, node);

    expect(result.synced).toBe(2);
    expect(result.errors).toEqual([]);

    const aliceBytes = (
      db.query("SELECT used_bytes FROM users WHERE id = ?").get(alice.id) as any
    ).used_bytes;
    const bobBytes = (
      db.query("SELECT used_bytes FROM users WHERE id = ?").get(bob.id) as any
    ).used_bytes;

    expect(aliceBytes).toBe(300);
    expect(bobBytes).toBe(1100);
  });

  test("records error for unknown username but continues syncing others", async () => {
    const node = createNodeWithStats();
    createUser(db, { name: "alice", password: "pass" });

    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          alice: { tx: 100, rx: 200 },
          unknown_user: { tx: 50, rx: 50 },
        })
      );
    };

    const result = await syncTrafficFromNode(db, node);

    expect(result.synced).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("unknown_user");
  });

  test("skips entries with zero traffic", async () => {
    const node = createNodeWithStats();
    createUser(db, { name: "alice", password: "pass" });

    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          alice: { tx: 0, rx: 0 },
        })
      );
    };

    const result = await syncTrafficFromNode(db, node);

    expect(result.synced).toBe(0);
    expect(result.errors).toEqual([]);

    const logs = db.query("SELECT * FROM traffic_logs").all();
    expect(logs).toHaveLength(0);
  });

  test("handles fetch failure gracefully", async () => {
    const node = createNodeWithStats();

    globalThis.fetch = async () => {
      throw new Error("Connection refused");
    };

    const result = await syncTrafficFromNode(db, node);

    expect(result.nodeId).toBe(node.id);
    expect(result.synced).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Connection refused");
  });

  test("handles non-OK HTTP response", async () => {
    const node = createNodeWithStats();

    globalThis.fetch = async () => {
      return new Response("Internal Server Error", { status: 500 });
    };

    const result = await syncTrafficFromNode(db, node);

    expect(result.synced).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("500");
  });

  test("accumulates used_bytes across multiple syncs", async () => {
    const node = createNodeWithStats();
    const user = createUser(db, { name: "alice", password: "pass" });

    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({ alice: { tx: 1000, rx: 2000 } })
      );
    };

    await syncTrafficFromNode(db, node);
    await syncTrafficFromNode(db, node);

    const updatedUser = db
      .query("SELECT used_bytes FROM users WHERE id = ?")
      .get(user.id) as any;
    expect(updatedUser.used_bytes).toBe(6000);

    const logs = db.query("SELECT * FROM traffic_logs").all();
    expect(logs).toHaveLength(2);
  });
});

describe("syncAllNodes", () => {
  test("syncs all enabled nodes with stats_port", async () => {
    const node1 = createNodeWithStats({ name: "node-1", host: "1.1.1.1" });
    const node2 = createNodeWithStats({ name: "node-2", host: "2.2.2.2" });
    // Node without stats_port - should be skipped
    addNode(db, {
      name: "node-3",
      host: "3.3.3.3",
      port: 443,
      protocol: "hysteria2",
    });
    // Disabled node with stats_port - should be skipped
    addNode(db, {
      name: "node-4",
      host: "4.4.4.4",
      port: 443,
      protocol: "hysteria2",
      stats_port: 9090,
      stats_secret: "secret",
      enabled: 0,
    });

    createUser(db, { name: "alice", password: "pass" });

    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({ alice: { tx: 100, rx: 200 } })
      );
    };

    const results = await syncAllNodes(db);

    expect(results).toHaveLength(2);
    const nodeIds = results.map((r) => r.nodeId).sort();
    expect(nodeIds).toEqual([node1.id, node2.id].sort());
  });

  test("continues syncing other nodes when one fails", async () => {
    const node1 = createNodeWithStats({ name: "node-1", host: "1.1.1.1" });
    const node2 = createNodeWithStats({ name: "node-2", host: "2.2.2.2" });
    createUser(db, { name: "alice", password: "pass" });

    let callCount = 0;
    globalThis.fetch = async (url) => {
      callCount++;
      if (String(url).includes("1.1.1.1")) {
        throw new Error("Connection refused");
      }
      return new Response(
        JSON.stringify({ alice: { tx: 100, rx: 200 } })
      );
    };

    const results = await syncAllNodes(db);

    expect(results).toHaveLength(2);
    const failedResult = results.find((r) => r.nodeId === node1.id);
    const successResult = results.find((r) => r.nodeId === node2.id);

    expect(failedResult!.errors.length).toBeGreaterThan(0);
    expect(successResult!.synced).toBe(1);
    expect(callCount).toBe(2);
  });

  test("returns empty array when no nodes have stats_port", async () => {
    addNode(db, {
      name: "node-1",
      host: "1.1.1.1",
      port: 443,
      protocol: "hysteria2",
    });

    const results = await syncAllNodes(db);
    expect(results).toEqual([]);
  });
});

describe("getTrafficStats", () => {
  test("returns all traffic logs when no filters", () => {
    const node = createNodeWithStats();
    const alice = createUser(db, { name: "alice", password: "pass" });
    const bob = createUser(db, { name: "bob", password: "pass" });

    db.run(
      "INSERT INTO traffic_logs (user_id, node_id, tx_bytes, rx_bytes) VALUES (?, ?, ?, ?)",
      [alice.id, node.id, 1000, 2000]
    );
    db.run(
      "INSERT INTO traffic_logs (user_id, node_id, tx_bytes, rx_bytes) VALUES (?, ?, ?, ?)",
      [bob.id, node.id, 500, 600]
    );

    const stats = getTrafficStats(db);

    expect(stats).toHaveLength(2);
    expect(stats[0].txBytes).toBe(1000);
    expect(stats[0].rxBytes).toBe(2000);
    expect(stats[1].txBytes).toBe(500);
    expect(stats[1].rxBytes).toBe(600);
  });

  test("filters by userId", () => {
    const node = createNodeWithStats();
    const alice = createUser(db, { name: "alice", password: "pass" });
    const bob = createUser(db, { name: "bob", password: "pass" });

    db.run(
      "INSERT INTO traffic_logs (user_id, node_id, tx_bytes, rx_bytes) VALUES (?, ?, ?, ?)",
      [alice.id, node.id, 1000, 2000]
    );
    db.run(
      "INSERT INTO traffic_logs (user_id, node_id, tx_bytes, rx_bytes) VALUES (?, ?, ?, ?)",
      [bob.id, node.id, 500, 600]
    );

    const stats = getTrafficStats(db, { userId: alice.id });

    expect(stats).toHaveLength(1);
    expect(stats[0].userId).toBe(alice.id);
  });

  test("filters by nodeId", () => {
    const node1 = createNodeWithStats({ name: "node-1", host: "1.1.1.1" });
    const node2 = createNodeWithStats({ name: "node-2", host: "2.2.2.2" });
    const alice = createUser(db, { name: "alice", password: "pass" });

    db.run(
      "INSERT INTO traffic_logs (user_id, node_id, tx_bytes, rx_bytes) VALUES (?, ?, ?, ?)",
      [alice.id, node1.id, 1000, 2000]
    );
    db.run(
      "INSERT INTO traffic_logs (user_id, node_id, tx_bytes, rx_bytes) VALUES (?, ?, ?, ?)",
      [alice.id, node2.id, 500, 600]
    );

    const stats = getTrafficStats(db, { nodeId: node1.id });

    expect(stats).toHaveLength(1);
    expect(stats[0].nodeId).toBe(node1.id);
  });

  test("filters by date range (from and to)", () => {
    const node = createNodeWithStats();
    const alice = createUser(db, { name: "alice", password: "pass" });

    db.run(
      "INSERT INTO traffic_logs (user_id, node_id, tx_bytes, rx_bytes, recorded_at) VALUES (?, ?, ?, ?, ?)",
      [alice.id, node.id, 1000, 2000, "2026-01-15 12:00:00"]
    );
    db.run(
      "INSERT INTO traffic_logs (user_id, node_id, tx_bytes, rx_bytes, recorded_at) VALUES (?, ?, ?, ?, ?)",
      [alice.id, node.id, 500, 600, "2026-02-15 12:00:00"]
    );
    db.run(
      "INSERT INTO traffic_logs (user_id, node_id, tx_bytes, rx_bytes, recorded_at) VALUES (?, ?, ?, ?, ?)",
      [alice.id, node.id, 300, 400, "2026-03-15 12:00:00"]
    );

    const stats = getTrafficStats(db, {
      from: "2026-02-01",
      to: "2026-03-01",
    });

    expect(stats).toHaveLength(1);
    expect(stats[0].txBytes).toBe(500);
  });

  test("returns empty array when no logs exist", () => {
    const stats = getTrafficStats(db);
    expect(stats).toEqual([]);
  });

  test("combines multiple filters", () => {
    const node1 = createNodeWithStats({ name: "node-1", host: "1.1.1.1" });
    const node2 = createNodeWithStats({ name: "node-2", host: "2.2.2.2" });
    const alice = createUser(db, { name: "alice", password: "pass" });
    const bob = createUser(db, { name: "bob", password: "pass" });

    db.run(
      "INSERT INTO traffic_logs (user_id, node_id, tx_bytes, rx_bytes, recorded_at) VALUES (?, ?, ?, ?, ?)",
      [alice.id, node1.id, 100, 200, "2026-02-15 12:00:00"]
    );
    db.run(
      "INSERT INTO traffic_logs (user_id, node_id, tx_bytes, rx_bytes, recorded_at) VALUES (?, ?, ?, ?, ?)",
      [alice.id, node2.id, 300, 400, "2026-02-15 12:00:00"]
    );
    db.run(
      "INSERT INTO traffic_logs (user_id, node_id, tx_bytes, rx_bytes, recorded_at) VALUES (?, ?, ?, ?, ?)",
      [bob.id, node1.id, 500, 600, "2026-02-15 12:00:00"]
    );

    const stats = getTrafficStats(db, {
      userId: alice.id,
      nodeId: node1.id,
    });

    expect(stats).toHaveLength(1);
    expect(stats[0].txBytes).toBe(100);
  });
});

describe("startTrafficSync", () => {
  test("returns a timer that can be cleared", () => {
    const timer = startTrafficSync(db, 60000);
    expect(timer).toBeDefined();
    clearInterval(timer);
  });

  test("calls syncAllNodes on interval", async () => {
    // Create a node and user so we can verify sync happened
    createNodeWithStats();
    createUser(db, { name: "alice", password: "pass" });

    let fetchCallCount = 0;
    globalThis.fetch = async () => {
      fetchCallCount++;
      return new Response(JSON.stringify({ alice: { tx: 10, rx: 20 } }));
    };

    const timer = startTrafficSync(db, 50);

    // Wait for at least one interval tick
    await new Promise((resolve) => setTimeout(resolve, 120));
    clearInterval(timer);

    expect(fetchCallCount).toBeGreaterThanOrEqual(1);
  });
});
