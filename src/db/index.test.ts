import { describe, test, expect, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initDatabase, type Db } from "./index";

describe("database", () => {
  let db: Db;

  afterEach(() => {
    db?.$client?.close();
  });

  test("创建所有表", () => {
    db = initDatabase(":memory:");
    const tables = db.$client
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("nodes");
    expect(names).toContain("users");
    expect(names).toContain("user_nodes");
    expect(names).toContain("subscriptions");
    expect(names).toContain("traffic_logs");
  });

  test("幂等（可安全调用多次）", () => {
    db = initDatabase(":memory:");
    expect(() => initDatabase(":memory:")).not.toThrow();
  });

  test("nodes 表包含正确的列", () => {
    db = initDatabase(":memory:");
    const info = db.$client.query("PRAGMA table_info(nodes)").all() as { name: string }[];
    const cols = info.map((c) => c.name);
    expect(cols).not.toContain("auth_secret");
    expect(cols).toContain("sni");
    expect(cols).toContain("ssh_port");
    expect(cols).toContain("stats_port");
    expect(cols).toContain("stats_secret");
    expect(cols).toContain("obfs_password");
  });

  test("users 表包含正确的列", () => {
    db = initDatabase(":memory:");
    const info = db.$client.query("PRAGMA table_info(users)").all() as { name: string }[];
    const cols = info.map((c) => c.name);
    expect(cols).toContain("quota_bytes");
    expect(cols).toContain("used_bytes");
    expect(cols).toContain("expires_at");
    expect(cols).toContain("max_devices");
  });

  test("级联删除：删除用户后 user_nodes 同步清除", () => {
    db = initDatabase(":memory:");
    db.$client.run("INSERT INTO users (id, name, password) VALUES ('u1', 'alice', 'pass')");
    db.$client.run("INSERT INTO nodes (id, name, host, port, protocol) VALUES ('n1', 'US', 'host', 443, 'hysteria2')");
    db.$client.run("INSERT INTO user_nodes (user_id, node_id) VALUES ('u1', 'n1')");
    db.$client.run("DELETE FROM users WHERE id = 'u1'");
    const rows = db.$client.query("SELECT * FROM user_nodes").all();
    expect(rows).toHaveLength(0);
  });

  test("级联删除：删除用户后 subscriptions 同步清除", () => {
    db = initDatabase(":memory:");
    db.$client.run("INSERT INTO users (id, name, password) VALUES ('u1', 'alice', 'pass')");
    db.$client.run("INSERT INTO subscriptions (id, user_id, token, format) VALUES ('s1', 'u1', 'tok', 'shadowrocket')");
    db.$client.run("DELETE FROM users WHERE id = 'u1'");
    const rows = db.$client.query("SELECT * FROM subscriptions").all();
    expect(rows).toHaveLength(0);
  });

  test("级联删除：删除节点后 user_nodes 同步清除", () => {
    db = initDatabase(":memory:");
    db.$client.run("INSERT INTO users (id, name, password) VALUES ('u1', 'alice', 'pass')");
    db.$client.run("INSERT INTO nodes (id, name, host, port, protocol) VALUES ('n1', 'US', 'host', 443, 'hysteria2')");
    db.$client.run("INSERT INTO user_nodes (user_id, node_id) VALUES ('u1', 'n1')");
    db.$client.run("DELETE FROM nodes WHERE id = 'n1'");
    const rows = db.$client.query("SELECT * FROM user_nodes").all();
    expect(rows).toHaveLength(0);
  });

  test("旧数据库初始化后会移除 nodes.auth_secret 列", () => {
    const dir = mkdtempSync(join(tmpdir(), "tunpilot-db-"));
    const path = join(dir, "legacy.db");
    const legacy = new Database(path);
    legacy.run(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        protocol TEXT NOT NULL,
        auth_secret TEXT NOT NULL,
        stats_port INTEGER,
        stats_secret TEXT,
        sni TEXT,
        cert_path TEXT,
        cert_expires TEXT,
        hy2_version TEXT,
        config_path TEXT,
        ssh_user TEXT,
        ssh_port INTEGER DEFAULT 22,
        ssh_alias TEXT,
        cert_fingerprint TEXT,
        insecure INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    legacy.run("INSERT INTO nodes (id, name, host, port, protocol, auth_secret) VALUES ('n1', 'US', 'host', 443, 'hysteria2', 'secret')");
    legacy.close();

    db = initDatabase(path);

    const info = db.$client.query("PRAGMA table_info(nodes)").all() as { name: string }[];
    const cols = info.map((c) => c.name);
    expect(cols).not.toContain("auth_secret");
    const row = db.$client.query("SELECT id, name FROM nodes WHERE id = 'n1'").get() as { id: string; name: string };
    expect(row.id).toBe("n1");
    expect(row.name).toBe("US");

    db.$client.close();
    db = undefined as unknown as Db;
    rmSync(dir, { recursive: true, force: true });
  });
});
