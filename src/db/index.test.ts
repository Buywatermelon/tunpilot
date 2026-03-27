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

    // 验证 FK 修复：依赖表不应指向 nodes_old
    for (const table of ["user_nodes", "traffic_logs"]) {
      const fks = db.$client.query(`PRAGMA foreign_key_list(${table})`).all() as Array<{ table: string }>;
      for (const fk of fks) {
        expect(fk.table).not.toContain("_old");
      }
    }

    db.$client.close();
    db = undefined as unknown as Db;
    rmSync(dir, { recursive: true, force: true });
  });

  test("修复依赖表中指向已不存在表的外键引用", () => {
    const dir = mkdtempSync(join(tmpdir(), "tunpilot-db-"));
    const path = join(dir, "stale-fk.db");
    const raw = new Database(path);

    // 模拟 rebuildNodesTableWithoutAuthSecret 留下的后遗症：
    // traffic_logs 和 user_nodes 的 FK 指向 nodes_old
    raw.run("PRAGMA foreign_keys = OFF");
    raw.run(`CREATE TABLE nodes (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, host TEXT NOT NULL,
      port INTEGER NOT NULL, protocol TEXT NOT NULL,
      stats_port INTEGER, stats_secret TEXT, sni TEXT, cert_path TEXT,
      cert_expires TEXT, hy2_version TEXT, config_path TEXT, ssh_user TEXT,
      ssh_port INTEGER DEFAULT 22, ssh_alias TEXT, cert_fingerprint TEXT,
      insecure INTEGER DEFAULT 0, obfs_password TEXT, enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    raw.run(`CREATE TABLE users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, password TEXT NOT NULL UNIQUE,
      quota_bytes INTEGER DEFAULT 0, used_bytes INTEGER DEFAULT 0,
      expires_at TEXT, max_devices INTEGER DEFAULT 3, enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    // 故意让 FK 指向 nodes_old（模拟 SQLite rename 的副作用）
    raw.run(`CREATE TABLE user_nodes (
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      node_id TEXT REFERENCES nodes_old(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, node_id)
    )`);
    raw.run(`CREATE TABLE traffic_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT REFERENCES users(id),
      node_id TEXT REFERENCES nodes_old(id),
      tx_bytes INTEGER DEFAULT 0, rx_bytes INTEGER DEFAULT 0,
      recorded_at TEXT DEFAULT (datetime('now'))
    )`);
    raw.run("INSERT INTO nodes VALUES ('n1','US','host',443,'hysteria2',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,22,NULL,NULL,0,NULL,1,datetime('now'))");
    raw.run("INSERT INTO users VALUES ('u1','alice','pass',0,0,NULL,3,1,datetime('now'))");
    raw.run("INSERT INTO user_nodes VALUES ('u1','n1')");
    raw.run("INSERT INTO traffic_logs (user_id,node_id,tx_bytes,rx_bytes) VALUES ('u1','n1',100,200)");
    raw.run("PRAGMA foreign_keys = ON");
    raw.close();

    db = initDatabase(path);

    // 验证 FK 修复后指向 nodes 而非 nodes_old
    for (const table of ["user_nodes", "traffic_logs"]) {
      const fks = db.$client.query(`PRAGMA foreign_key_list(${table})`).all() as Array<{ table: string }>;
      for (const fk of fks) {
        expect(fk.table).not.toContain("_old");
      }
    }

    // 验证数据完整性
    const un = db.$client.query("SELECT * FROM user_nodes").all();
    expect(un).toHaveLength(1);
    const tl = db.$client.query("SELECT * FROM traffic_logs").all();
    expect(tl).toHaveLength(1);

    // 验证 FK 约束实际生效（删除 node 应级联删除 user_nodes）
    // traffic_logs 没有 ON DELETE CASCADE，需先清除引用
    db.$client.run("DELETE FROM traffic_logs WHERE node_id = 'n1'");
    db.$client.run("DELETE FROM nodes WHERE id = 'n1'");
    expect(db.$client.query("SELECT * FROM user_nodes").all()).toHaveLength(0);

    db.$client.close();
    db = undefined as unknown as Db;
    rmSync(dir, { recursive: true, force: true });
  });
});
