import { Database } from "bun:sqlite";

export function initDatabase(path: string): Database {
  const db = new Database(path);

  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
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

  db.run(`
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

  db.run(`
    CREATE TABLE IF NOT EXISTS user_nodes (
      user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
      node_id       TEXT REFERENCES nodes(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, node_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id            TEXT PRIMARY KEY,
      user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
      token         TEXT NOT NULL UNIQUE,
      format        TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS traffic_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       TEXT REFERENCES users(id),
      node_id       TEXT REFERENCES nodes(id),
      tx_bytes      INTEGER DEFAULT 0,
      rx_bytes      INTEGER DEFAULT 0,
      recorded_at   TEXT DEFAULT (datetime('now'))
    )
  `);

  return db;
}
