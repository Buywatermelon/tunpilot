import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

// 数据库实例类型，所有 service 函数使用此类型
// 包含 $client 属性以访问底层 bun:sqlite Database
export type Db = BunSQLiteDatabase<typeof schema> & { $client: Database };

function getNodesTableSql(tableName: string, withIfNotExists: boolean = true): string {
  return `
  CREATE TABLE ${withIfNotExists ? "IF NOT EXISTS " : ""}${tableName} (
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
`;
}

function getTableColumns(sqlite: Database, table: string): string[] {
  return (sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((col) => col.name);
}

function rebuildNodesTableWithoutAuthSecret(sqlite: Database): void {
  const columns = new Set(getTableColumns(sqlite, "nodes"));
  const read = (column: string, fallback: string = "NULL") => columns.has(column) ? `"${column}"` : fallback;

  sqlite.run("PRAGMA foreign_keys = OFF");
  try {
    sqlite.run("BEGIN");
    sqlite.run("DROP TABLE IF EXISTS nodes_new");
    sqlite.run("ALTER TABLE nodes RENAME TO nodes_old");
    sqlite.run(getNodesTableSql("nodes_new", false));
    sqlite.run(`
      INSERT INTO nodes_new (
        id, name, host, port, protocol, stats_port, stats_secret, sni, cert_path, cert_expires,
        hy2_version, config_path, ssh_user, ssh_port, ssh_alias, cert_fingerprint, insecure,
        obfs_password, enabled, created_at
      )
      SELECT
        ${read("id")},
        ${read("name")},
        ${read("host")},
        ${read("port")},
        ${read("protocol")},
        ${read("stats_port")},
        ${read("stats_secret")},
        ${read("sni")},
        ${read("cert_path")},
        ${read("cert_expires")},
        ${read("hy2_version")},
        ${read("config_path")},
        ${read("ssh_user")},
        ${read("ssh_port", "22")},
        ${read("ssh_alias")},
        ${read("cert_fingerprint")},
        ${read("insecure", "0")},
        ${read("obfs_password")},
        ${read("enabled", "1")},
        ${read("created_at", "datetime('now')")}
      FROM nodes_old
    `);
    sqlite.run("DROP TABLE nodes_old");
    sqlite.run("ALTER TABLE nodes_new RENAME TO nodes");
    sqlite.run("COMMIT");
  } catch (err) {
    try { sqlite.run("ROLLBACK"); } catch {}
    throw err;
  } finally {
    sqlite.run("PRAGMA foreign_keys = ON");
  }
}

function migrateNodesTable(sqlite: Database): void {
  const columns = getTableColumns(sqlite, "nodes");
  if (columns.includes("auth_secret")) {
    rebuildNodesTableWithoutAuthSecret(sqlite);
    return;
  }

  if (!columns.includes("obfs_password")) {
    sqlite.run(`ALTER TABLE nodes ADD COLUMN obfs_password TEXT`);
  }
}

// 初始化数据库：创建表 + 返回 Drizzle 实例
export function initDatabase(path: string): Db {
  const sqlite = new Database(path);
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");

  // 建表（CREATE TABLE IF NOT EXISTS 保证幂等）
  // 生产环境也可用 drizzle-kit push 同步 schema
  sqlite.run(getNodesTableSql("nodes"));

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

  // 默认分流规则
  sqlite.run(`INSERT OR IGNORE INTO routing_rules (id, rule_set_key, action, priority) VALUES
    ('private-direct', 'private', 'direct', 100),
    ('ads-reject', 'ads', 'reject', 90),
    ('cn-direct', 'cn', 'direct', 80),
    ('catch-all', 'match', 'proxy', 0)
  `);

  // 索引
  sqlite.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_password ON users(password)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_traffic_logs_recorded_at ON traffic_logs(recorded_at)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_traffic_logs_user_node ON traffic_logs(user_id, node_id)`);

  // 在线迁移：为已有数据库升级表结构/索引
  migrateNodesTable(sqlite);
  try { sqlite.run(`ALTER TABLE nodes ADD COLUMN insecure INTEGER DEFAULT 0`); } catch {}
  try { sqlite.run(`ALTER TABLE nodes ADD COLUMN ssh_alias TEXT`); } catch {}
  try { sqlite.run(`ALTER TABLE nodes ADD COLUMN cert_fingerprint TEXT`); } catch {}
  // 升级 password 索引为 UNIQUE（先删旧索引再建新索引）
  try {
    sqlite.run(`DROP INDEX IF EXISTS idx_users_password`);
    sqlite.run(`CREATE UNIQUE INDEX idx_users_password ON users(password)`);
  } catch {}

  return drizzle(sqlite, { schema });
}
