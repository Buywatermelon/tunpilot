import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

// 数据库实例类型，所有 service 函数使用此类型
// 包含 $client 属性以访问底层 bun:sqlite Database
export type Db = BunSQLiteDatabase<typeof schema> & { $client: Database };

// 初始化数据库：创建表 + 返回 Drizzle 实例
export function initDatabase(path: string): Db {
  const sqlite = new Database(path);
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");

  // 建表（CREATE TABLE IF NOT EXISTS 保证幂等）
  // 生产环境也可用 drizzle-kit push 同步 schema
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS nodes (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      host          TEXT NOT NULL,
      port          INTEGER NOT NULL,
      protocol      TEXT NOT NULL,
      auth_secret   TEXT NOT NULL,
      stats_port    INTEGER,
      stats_secret  TEXT,
      sni           TEXT,
      cert_path     TEXT,
      cert_expires  TEXT,
      hy2_version   TEXT,
      config_path   TEXT,
      ssh_user      TEXT,
      ssh_port      INTEGER DEFAULT 22,
      enabled       INTEGER DEFAULT 1,
      created_at    TEXT DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL UNIQUE,
      password      TEXT NOT NULL,
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

  return drizzle(sqlite, { schema });
}
