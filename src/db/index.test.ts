import { describe, test, expect, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase } from "./index";

describe("database", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  test("creates all tables", () => {
    db = initDatabase(":memory:");
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("nodes");
    expect(names).toContain("users");
    expect(names).toContain("user_nodes");
    expect(names).toContain("subscriptions");
    expect(names).toContain("traffic_logs");
  });

  test("is idempotent (safe to call twice)", () => {
    db = initDatabase(":memory:");
    expect(() => initDatabase(":memory:")).not.toThrow();
  });

  test("nodes table has correct columns", () => {
    db = initDatabase(":memory:");
    const info = db.query("PRAGMA table_info(nodes)").all() as { name: string }[];
    const cols = info.map((c) => c.name);
    expect(cols).toContain("auth_secret");
    expect(cols).toContain("sni");
    expect(cols).toContain("ssh_port");
    expect(cols).toContain("stats_port");
    expect(cols).toContain("stats_secret");
  });

  test("users table has correct columns", () => {
    db = initDatabase(":memory:");
    const info = db.query("PRAGMA table_info(users)").all() as { name: string }[];
    const cols = info.map((c) => c.name);
    expect(cols).toContain("quota_bytes");
    expect(cols).toContain("used_bytes");
    expect(cols).toContain("expires_at");
    expect(cols).toContain("max_devices");
  });

  test("cascade deletes work for user_nodes", () => {
    db = initDatabase(":memory:");
    db.run("INSERT INTO users (id, name, password) VALUES ('u1', 'alice', 'pass')");
    db.run("INSERT INTO nodes (id, name, host, port, protocol, auth_secret) VALUES ('n1', 'US', 'host', 443, 'hysteria2', 'secret')");
    db.run("INSERT INTO user_nodes (user_id, node_id) VALUES ('u1', 'n1')");
    db.run("DELETE FROM users WHERE id = 'u1'");
    const rows = db.query("SELECT * FROM user_nodes").all();
    expect(rows).toHaveLength(0);
  });

  test("cascade deletes work for subscriptions", () => {
    db = initDatabase(":memory:");
    db.run("INSERT INTO users (id, name, password) VALUES ('u1', 'alice', 'pass')");
    db.run("INSERT INTO subscriptions (id, user_id, token, format) VALUES ('s1', 'u1', 'tok', 'shadowrocket')");
    db.run("DELETE FROM users WHERE id = 'u1'");
    const rows = db.query("SELECT * FROM subscriptions").all();
    expect(rows).toHaveLength(0);
  });

  test("cascade deletes work when node is removed", () => {
    db = initDatabase(":memory:");
    db.run("INSERT INTO users (id, name, password) VALUES ('u1', 'alice', 'pass')");
    db.run("INSERT INTO nodes (id, name, host, port, protocol, auth_secret) VALUES ('n1', 'US', 'host', 443, 'hysteria2', 'secret')");
    db.run("INSERT INTO user_nodes (user_id, node_id) VALUES ('u1', 'n1')");
    db.run("DELETE FROM nodes WHERE id = 'n1'");
    const rows = db.query("SELECT * FROM user_nodes").all();
    expect(rows).toHaveLength(0);
  });
});
