import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

export type Db = BunSQLiteDatabase<typeof schema> & { $client: Database };

export function initDatabase(path: string): Db {
  const sqlite = new Database(path);
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS nodes (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      host          TEXT NOT NULL,
      port          INTEGER NOT NULL,
      protocol      TEXT NOT NULL,
      stats_port    INTEGER,
      stats_secret  TEXT,
      sni           TEXT,
      cert_path     TEXT,
      cert_expires  TEXT,
      hy2_version   TEXT,
      config_path   TEXT,
      ssh_user      TEXT,
      ssh_port      INTEGER DEFAULT 22,
      ssh_alias     TEXT,
      cert_fingerprint TEXT,
      insecure      INTEGER DEFAULT 0,
      enabled       INTEGER DEFAULT 1,
      created_at    TEXT DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL UNIQUE,
      password      TEXT NOT NULL UNIQUE,
      quota_bytes   INTEGER DEFAULT 0,
      used_bytes    INTEGER DEFAULT 0,
      expires_at    TEXT,
      max_devices   INTEGER DEFAULT 3,
      enabled       INTEGER DEFAULT 1,
      created_at    TEXT DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS user_nodes (
      user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
      node_id       TEXT REFERENCES nodes(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, node_id)
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id            TEXT PRIMARY KEY,
      user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
      token         TEXT NOT NULL UNIQUE,
      format        TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS traffic_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
      node_id       TEXT REFERENCES nodes(id) ON DELETE CASCADE,
      tx_bytes      INTEGER DEFAULT 0,
      rx_bytes      INTEGER DEFAULT 0,
      recorded_at   TEXT DEFAULT (datetime('now'))
    )
  `);

  // 迁移旧库：traffic_logs 原本未声明 ON DELETE CASCADE，
  // 导致删除拥有流量日志的节点/用户时触发 FK 约束失败。
  migrateTrafficLogsCascade(sqlite);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TEXT DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_password ON users(password)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_traffic_logs_recorded_at ON traffic_logs(recorded_at)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_traffic_logs_user_node ON traffic_logs(user_id, node_id)`);

  return drizzle(sqlite, { schema });
}

function migrateTrafficLogsCascade(sqlite: Database): void {
  const row = sqlite
    .query("SELECT sql FROM sqlite_master WHERE type='table' AND name='traffic_logs'")
    .get() as { sql: string } | null;
  if (!row || /ON DELETE CASCADE/i.test(row.sql)) return;

  sqlite.run("PRAGMA foreign_keys = OFF");
  try {
    sqlite.transaction(() => {
      sqlite.run(`
        CREATE TABLE traffic_logs_new (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
          node_id       TEXT REFERENCES nodes(id) ON DELETE CASCADE,
          tx_bytes      INTEGER DEFAULT 0,
          rx_bytes      INTEGER DEFAULT 0,
          recorded_at   TEXT DEFAULT (datetime('now'))
        )
      `);
      sqlite.run(
        "INSERT INTO traffic_logs_new (id, user_id, node_id, tx_bytes, rx_bytes, recorded_at) " +
          "SELECT id, user_id, node_id, tx_bytes, rx_bytes, recorded_at FROM traffic_logs"
      );
      sqlite.run("DROP TABLE traffic_logs");
      sqlite.run("ALTER TABLE traffic_logs_new RENAME TO traffic_logs");
    })();
  } finally {
    sqlite.run("PRAGMA foreign_keys = ON");
  }
}
