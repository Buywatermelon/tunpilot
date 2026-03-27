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
      obfs_password TEXT,
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
      user_id       TEXT REFERENCES users(id),
      node_id       TEXT REFERENCES nodes(id),
      tx_bytes      INTEGER DEFAULT 0,
      rx_bytes      INTEGER DEFAULT 0,
      recorded_at   TEXT DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TEXT DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS routing_rules (
      id            TEXT PRIMARY KEY,
      rule_set_key  TEXT NOT NULL,
      action        TEXT NOT NULL,
      strict        INTEGER DEFAULT 0,
      priority      INTEGER DEFAULT 0,
      enabled       INTEGER DEFAULT 1,
      created_at    TEXT DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS custom_rules (
      id            TEXT PRIMARY KEY,
      type          TEXT NOT NULL,
      value         TEXT NOT NULL,
      action        TEXT NOT NULL,
      priority      INTEGER DEFAULT 100,
      enabled       INTEGER DEFAULT 1,
      description   TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`INSERT OR IGNORE INTO routing_rules (id, rule_set_key, action, priority) VALUES
    ('private-direct', 'private', 'direct', 100),
    ('ads-reject', 'ads', 'reject', 90),
    ('cn-direct', 'cn', 'direct', 80),
    ('catch-all', 'match', 'proxy', 0)
  `);

  sqlite.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_password ON users(password)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_traffic_logs_recorded_at ON traffic_logs(recorded_at)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_traffic_logs_user_node ON traffic_logs(user_id, node_id)`);

  return drizzle(sqlite, { schema });
}
