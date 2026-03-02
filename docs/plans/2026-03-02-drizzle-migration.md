# Drizzle ORM 迁移实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将数据库层从 raw SQL (bun:sqlite) 迁移到 Drizzle ORM，同时将所有代码注释改为中文。

**Architecture:** Drizzle schema 定义在 `src/db/schema.ts`，类型从 schema 推导。`initDatabase` 仍然用 CREATE TABLE IF NOT EXISTS 建表（适配 :memory: 测试），同时配置 `drizzle-kit push` 用于开发时同步 schema 变更。所有 service 函数的 `db` 参数从 `bun:sqlite` 的 `Database` 改为 Drizzle 的 `BunSQLiteDatabase`。

**Tech Stack:** drizzle-orm, drizzle-kit (dev), bun:sqlite, bun:test

---

### Task 1: 安装依赖 + 创建 Drizzle Schema

**Files:**
- Modify: `package.json`
- Create: `src/db/schema.ts`
- Create: `drizzle.config.ts`

**Step 1: 安装依赖**

```bash
bun add drizzle-orm && bun add -d drizzle-kit
```

**Step 2: 创建 `src/db/schema.ts`**

```ts
// src/db/schema.ts
import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// 代理节点表
export const nodes = sqliteTable("nodes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  protocol: text("protocol").notNull(),
  auth_secret: text("auth_secret").notNull(),
  stats_port: integer("stats_port"),
  stats_secret: text("stats_secret"),
  sni: text("sni"),
  cert_path: text("cert_path"),
  cert_expires: text("cert_expires"),
  hy2_version: text("hy2_version"),
  config_path: text("config_path"),
  ssh_user: text("ssh_user"),
  ssh_port: integer("ssh_port").default(22),
  enabled: integer("enabled").default(1),
  created_at: text("created_at").default(sql`(datetime('now'))`),
});

// 用户表
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  password: text("password").notNull(),
  quota_bytes: integer("quota_bytes").default(0),
  used_bytes: integer("used_bytes").default(0),
  expires_at: text("expires_at"),
  max_devices: integer("max_devices").default(3),
  enabled: integer("enabled").default(1),
  created_at: text("created_at").default(sql`(datetime('now'))`),
});

// 用户-节点关联表
export const userNodes = sqliteTable("user_nodes", {
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  node_id: text("node_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.user_id, table.node_id] }),
]);

// 订阅表
export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique().$defaultFn(() => crypto.randomUUID()),
  format: text("format").notNull(),
  created_at: text("created_at").default(sql`(datetime('now'))`),
});

// 流量日志表
export const trafficLogs = sqliteTable("traffic_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_id: text("user_id").references(() => users.id),
  node_id: text("node_id").references(() => nodes.id),
  tx_bytes: integer("tx_bytes").default(0),
  rx_bytes: integer("rx_bytes").default(0),
  recorded_at: text("recorded_at").default(sql`(datetime('now'))`),
});

// 从 schema 推导的类型
export type Node = typeof nodes.$inferSelect;
export type NewNode = typeof nodes.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type TrafficLog = typeof trafficLogs.$inferSelect;
export type NewTrafficLog = typeof trafficLogs.$inferInsert;
```

**Step 3: 创建 `drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/tunpilot.db",
  },
});
```

**Step 4: 在 `package.json` 中添加 drizzle 脚本**

在 `scripts` 中添加:
```json
"db:push": "drizzle-kit push",
"db:studio": "drizzle-kit studio"
```

**Step 5: 提交**

```bash
git add src/db/schema.ts drizzle.config.ts package.json bun.lock
git commit -m "feat: add Drizzle ORM schema and config"
```

---

### Task 2: 重写数据库初始化 + 测试基础设施

**Files:**
- Modify: `src/db/index.ts`
- Modify: `src/db/index.test.ts`

**Step 1: 重写 `src/db/index.ts`**

```ts
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

// 数据库实例类型，所有 service 函数使用此类型
export type Db = BunSQLiteDatabase<typeof schema>;

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
```

**Step 2: 重写 `src/db/index.test.ts`**

测试需要适配 Drizzle 实例。Drizzle 底层 SQLite 通过 `db.$client` 访问（用于 PRAGMA 查询等原始操作）。

```ts
import { describe, test, expect, afterEach } from "bun:test";
import { initDatabase, type Db } from "./index";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

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
    expect(cols).toContain("auth_secret");
    expect(cols).toContain("sni");
    expect(cols).toContain("ssh_port");
    expect(cols).toContain("stats_port");
    expect(cols).toContain("stats_secret");
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
    db.$client.run("INSERT INTO nodes (id, name, host, port, protocol, auth_secret) VALUES ('n1', 'US', 'host', 443, 'hysteria2', 'secret')");
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
    db.$client.run("INSERT INTO nodes (id, name, host, port, protocol, auth_secret) VALUES ('n1', 'US', 'host', 443, 'hysteria2', 'secret')");
    db.$client.run("INSERT INTO user_nodes (user_id, node_id) VALUES ('u1', 'n1')");
    db.$client.run("DELETE FROM nodes WHERE id = 'n1'");
    const rows = db.$client.query("SELECT * FROM user_nodes").all();
    expect(rows).toHaveLength(0);
  });
});
```

**Step 3: 运行测试验证**

```bash
bun test src/db/index.test.ts
```

预期：全部通过。

**Step 4: 提交**

```bash
git add src/db/index.ts src/db/index.test.ts
git commit -m "refactor: rewrite db init with Drizzle wrapper"
```

---

### Task 3: 迁移 user service

**Files:**
- Modify: `src/services/user.ts`
- Modify: `src/services/user.test.ts`

**Step 1: 重写 `src/services/user.ts`**

```ts
import { eq } from "drizzle-orm";
import type { Db } from "../db/index";
import { users, nodes, userNodes, type User, type NewUser } from "../db/schema";

// 创建用户参数（不含自动生成字段）
export type CreateUserParams = Pick<NewUser, "name" | "password"> &
  Partial<Pick<NewUser, "quota_bytes" | "expires_at" | "max_devices">>;

// 更新用户参数（所有可更新字段均为可选）
export type UpdateUserParams = Partial<
  Pick<User, "quota_bytes" | "expires_at" | "enabled" | "password" | "max_devices">
>;

// 创建用户
export function createUser(db: Db, params: CreateUserParams): User {
  return db.insert(users).values(params).returning().get();
}

// 列出所有用户
export function listUsers(db: Db): User[] {
  return db.select().from(users).all();
}

// 根据 ID 获取用户
export function getUser(db: Db, id: string): User | null {
  return db.select().from(users).where(eq(users.id, id)).get() ?? null;
}

// 更新用户（部分更新）
export function updateUser(db: Db, id: string, updates: UpdateUserParams): void {
  if (Object.keys(updates).length === 0) return;
  db.update(users).set(updates).where(eq(users.id, id)).run();
}

// 删除用户（级联删除关联数据）
export function deleteUser(db: Db, id: string): void {
  db.delete(users).where(eq(users.id, id)).run();
}

// 重置用户流量
export function resetTraffic(db: Db, userId: string): void {
  db.update(users).set({ used_bytes: 0 }).where(eq(users.id, userId)).run();
}

// 为用户分配节点（替换现有分配）
export function assignNodesToUser(db: Db, userId: string, nodeIds: string[]): void {
  db.delete(userNodes).where(eq(userNodes.user_id, userId)).run();
  for (const nodeId of nodeIds) {
    db.insert(userNodes).values({ user_id: userId, node_id: nodeId }).run();
  }
}

// 获取用户关联的节点列表
export function getUserNodes(db: Db, userId: string): (typeof nodes.$inferSelect)[] {
  const rows = db
    .select({ node: nodes })
    .from(nodes)
    .innerJoin(userNodes, eq(userNodes.node_id, nodes.id))
    .where(eq(userNodes.user_id, userId))
    .all();
  return rows.map((r) => r.node);
}

// 重新导出类型供其他模块使用
export type { User } from "../db/schema";
```

**Step 2: 更新 `src/services/user.test.ts`**

主要变更：
- `Database` → `Db`
- `initDatabase(":memory:")` 返回 Drizzle 实例
- `db?.close()` → `db?.$client?.close()`
- 测试中直接操作 DB 的地方使用 `db.$client.run()` 保持不变
- 注释改为中文

```ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, type Db } from "../db/index";
import {
  createUser,
  listUsers,
  getUser,
  updateUser,
  deleteUser,
  resetTraffic,
  assignNodesToUser,
  getUserNodes,
} from "./user";

describe("user service", () => {
  let db: Db;

  beforeEach(() => {
    db = initDatabase(":memory:");
  });

  afterEach(() => {
    db?.$client?.close();
  });

  // --- createUser ---

  describe("createUser", () => {
    test("使用必填字段创建用户", () => {
      const user = createUser(db, { name: "alice", password: "pass123" });
      expect(user.id).toBeDefined();
      expect(user.name).toBe("alice");
      expect(user.password).toBe("pass123");
      expect(user.quota_bytes).toBe(0);
      expect(user.used_bytes).toBe(0);
      expect(user.max_devices).toBe(3);
      expect(user.enabled).toBe(1);
      expect(user.expires_at).toBeNull();
      expect(user.created_at).toBeDefined();
    });

    test("使用可选字段创建用户", () => {
      const user = createUser(db, {
        name: "bob",
        password: "secret",
        quota_bytes: 1073741824,
        expires_at: "2026-12-31 23:59:59",
        max_devices: 5,
      });
      expect(user.quota_bytes).toBe(1073741824);
      expect(user.expires_at).toBe("2026-12-31 23:59:59");
      expect(user.max_devices).toBe(5);
    });

    test("生成唯一 ID", () => {
      const u1 = createUser(db, { name: "alice", password: "p1" });
      const u2 = createUser(db, { name: "bob", password: "p2" });
      expect(u1.id).not.toBe(u2.id);
    });

    test("拒绝重复用户名", () => {
      createUser(db, { name: "alice", password: "p1" });
      expect(() => createUser(db, { name: "alice", password: "p2" })).toThrow();
    });
  });

  // --- listUsers ---

  describe("listUsers", () => {
    test("无用户时返回空数组", () => {
      expect(listUsers(db)).toEqual([]);
    });

    test("返回所有用户", () => {
      createUser(db, { name: "alice", password: "p1" });
      createUser(db, { name: "bob", password: "p2" });
      const users = listUsers(db);
      expect(users).toHaveLength(2);
      expect(users.map((u) => u.name).sort()).toEqual(["alice", "bob"]);
    });

    test("包含 used_bytes 和 enabled 字段", () => {
      createUser(db, { name: "alice", password: "p1" });
      const users = listUsers(db);
      expect(users[0]!.used_bytes).toBe(0);
      expect(users[0]!.enabled).toBe(1);
    });
  });

  // --- getUser ---

  describe("getUser", () => {
    test("根据 ID 返回用户", () => {
      const created = createUser(db, { name: "alice", password: "p1" });
      const found = getUser(db, created.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe("alice");
      expect(found!.id).toBe(created.id);
    });

    test("ID 不存在时返回 null", () => {
      expect(getUser(db, "nonexistent")).toBeNull();
    });
  });

  // --- updateUser ---

  describe("updateUser", () => {
    test("更新 quota_bytes", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, { quota_bytes: 5368709120 });
      expect(getUser(db, user.id)!.quota_bytes).toBe(5368709120);
    });

    test("更新 expires_at", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, { expires_at: "2027-01-01 00:00:00" });
      expect(getUser(db, user.id)!.expires_at).toBe("2027-01-01 00:00:00");
    });

    test("更新 enabled", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, { enabled: 0 });
      expect(getUser(db, user.id)!.enabled).toBe(0);
    });

    test("更新 password", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, { password: "newpass" });
      expect(getUser(db, user.id)!.password).toBe("newpass");
    });

    test("更新 max_devices", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, { max_devices: 10 });
      expect(getUser(db, user.id)!.max_devices).toBe(10);
    });

    test("同时更新多个字段", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, { quota_bytes: 1000000, enabled: 0, max_devices: 1 });
      const updated = getUser(db, user.id)!;
      expect(updated.quota_bytes).toBe(1000000);
      expect(updated.enabled).toBe(0);
      expect(updated.max_devices).toBe(1);
    });

    test("空更新不报错", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, {});
      expect(getUser(db, user.id)!.name).toBe("alice");
    });
  });

  // --- deleteUser ---

  describe("deleteUser", () => {
    test("删除已有用户", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      deleteUser(db, user.id);
      expect(getUser(db, user.id)).toBeNull();
    });

    test("级联删除 user_nodes", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      db.$client.run(
        "INSERT INTO nodes (id, name, host, port, protocol, auth_secret) VALUES ('n1', 'US', 'host', 443, 'hysteria2', 'secret')"
      );
      db.$client.run(
        `INSERT INTO user_nodes (user_id, node_id) VALUES ('${user.id}', 'n1')`
      );
      deleteUser(db, user.id);
      const rows = db.$client.query("SELECT * FROM user_nodes").all();
      expect(rows).toHaveLength(0);
    });

    test("删除不存在的用户不报错", () => {
      expect(() => deleteUser(db, "nonexistent")).not.toThrow();
    });
  });

  // --- resetTraffic ---

  describe("resetTraffic", () => {
    test("将 used_bytes 重置为 0", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      db.$client.run(`UPDATE users SET used_bytes = 999999 WHERE id = '${user.id}'`);
      resetTraffic(db, user.id);
      expect(getUser(db, user.id)!.used_bytes).toBe(0);
    });

    test("重置不存在的用户不报错", () => {
      expect(() => resetTraffic(db, "nonexistent")).not.toThrow();
    });
  });

  // --- assignNodesToUser ---

  describe("assignNodesToUser", () => {
    function insertNode(id: string) {
      db.$client.run(
        `INSERT INTO nodes (id, name, host, port, protocol, auth_secret) VALUES ('${id}', 'Node ${id}', 'host', 443, 'hysteria2', 'secret')`
      );
    }

    test("为用户分配节点", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      insertNode("n1");
      insertNode("n2");
      assignNodesToUser(db, user.id, ["n1", "n2"]);
      const rows = db.$client
        .query("SELECT node_id FROM user_nodes WHERE user_id = ?")
        .all(user.id) as { node_id: string }[];
      expect(rows.map((r) => r.node_id).sort()).toEqual(["n1", "n2"]);
    });

    test("替换已有分配", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      insertNode("n1");
      insertNode("n2");
      insertNode("n3");
      assignNodesToUser(db, user.id, ["n1", "n2"]);
      assignNodesToUser(db, user.id, ["n2", "n3"]);
      const rows = db.$client
        .query("SELECT node_id FROM user_nodes WHERE user_id = ?")
        .all(user.id) as { node_id: string }[];
      expect(rows.map((r) => r.node_id).sort()).toEqual(["n2", "n3"]);
    });

    test("空数组清除所有分配", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      insertNode("n1");
      assignNodesToUser(db, user.id, ["n1"]);
      assignNodesToUser(db, user.id, []);
      const rows = db.$client
        .query("SELECT node_id FROM user_nodes WHERE user_id = ?")
        .all(user.id);
      expect(rows).toHaveLength(0);
    });
  });

  // --- getUserNodes ---

  describe("getUserNodes", () => {
    function insertNode(id: string, name: string) {
      db.$client.run(
        `INSERT INTO nodes (id, name, host, port, protocol, auth_secret) VALUES ('${id}', '${name}', 'host', 443, 'hysteria2', 'secret')`
      );
    }

    test("返回用户关联的节点", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      insertNode("n1", "US Node");
      insertNode("n2", "JP Node");
      assignNodesToUser(db, user.id, ["n1", "n2"]);
      const nodes = getUserNodes(db, user.id);
      expect(nodes).toHaveLength(2);
      expect(nodes.map((n) => n.name).sort()).toEqual(["JP Node", "US Node"]);
    });

    test("无节点时返回空数组", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      expect(getUserNodes(db, user.id)).toEqual([]);
    });

    test("返回完整的节点记录", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      insertNode("n1", "US Node");
      assignNodesToUser(db, user.id, ["n1"]);
      const nodes = getUserNodes(db, user.id);
      expect(nodes[0]!.id).toBe("n1");
      expect(nodes[0]!.host).toBe("host");
      expect(nodes[0]!.port).toBe(443);
      expect(nodes[0]!.protocol).toBe("hysteria2");
    });
  });
});
```

**Step 3: 运行测试**

```bash
bun test src/services/user.test.ts
```

预期：全部通过。

**Step 4: 提交**

```bash
git add src/services/user.ts src/services/user.test.ts
git commit -m "refactor: migrate user service to Drizzle"
```

---

### Task 4: 迁移 node service

**Files:**
- Modify: `src/services/node.ts`
- Modify: `src/services/node.test.ts`

**Step 1: 重写 `src/services/node.ts`**

```ts
import { eq } from "drizzle-orm";
import type { Db } from "../db/index";
import { nodes, type Node, type NewNode } from "../db/schema";

// 添加节点参数
export type AddNodeParams = Pick<NewNode, "name" | "host" | "port" | "protocol"> &
  Partial<Pick<NewNode, "stats_port" | "stats_secret" | "sni" | "cert_path" | "cert_expires" | "hy2_version" | "config_path" | "ssh_user" | "ssh_port" | "enabled">>;

// 更新节点参数（排除不可修改字段）
export type UpdateNodeParams = Partial<Omit<Node, "id" | "auth_secret" | "created_at">>;

// 生成 32 字节随机十六进制字符串
function generateAuthSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// 添加节点（自动生成 auth_secret）
export function addNode(db: Db, params: AddNodeParams): Node {
  return db.insert(nodes).values({
    ...params,
    auth_secret: generateAuthSecret(),
  }).returning().get();
}

// 列出所有节点
export function listNodes(db: Db): Node[] {
  return db.select().from(nodes).all();
}

// 根据 ID 获取节点
export function getNode(db: Db, id: string): Node | null {
  return db.select().from(nodes).where(eq(nodes.id, id)).get() ?? null;
}

// 更新节点（部分更新）
export function updateNode(db: Db, id: string, updates: UpdateNodeParams): Node | null {
  const existing = getNode(db, id);
  if (!existing) return null;
  if (Object.keys(updates).length === 0) return existing;
  db.update(nodes).set(updates).where(eq(nodes.id, id)).run();
  return getNode(db, id);
}

// 删除节点（级联删除 user_nodes）
export function removeNode(db: Db, id: string): void {
  db.delete(nodes).where(eq(nodes.id, id)).run();
}

export type { Node } from "../db/schema";
```

**Step 2: 更新 `src/services/node.test.ts`**

与 user.test.ts 同理：`Database` → `Db`，`db?.close()` → `db?.$client?.close()`，注释改中文。

测试内容保持不变，仅修改：
- import 从 `bun:sqlite` 改为 `../db/index`
- `let db: Database` → `let db: Db`
- `db.run(...)` 改为 `db.$client.run(...)` (仅测试中直接操作 SQL 的地方)
- 注释改中文

**Step 3: 运行测试**

```bash
bun test src/services/node.test.ts
```

**Step 4: 提交**

```bash
git add src/services/node.ts src/services/node.test.ts
git commit -m "refactor: migrate node service to Drizzle"
```

---

### Task 5: 迁移 auth service

**Files:**
- Modify: `src/services/auth.ts`
- Modify: `src/services/auth.test.ts`

**Step 1: 重写 `src/services/auth.ts`**

```ts
import { eq, and } from "drizzle-orm";
import type { Db } from "../db/index";
import { nodes, users, userNodes } from "../db/schema";

export interface AuthResult {
  ok: boolean;
  id?: string;
}

// 认证：校验节点 + 用户 + 权限
export function authenticate(
  db: Db,
  nodeId: string,
  authSecret: string,
  password: string
): AuthResult {
  // 1. 校验节点：存在、密钥匹配、已启用
  const node = db
    .select({ id: nodes.id })
    .from(nodes)
    .where(
      and(
        eq(nodes.id, nodeId),
        eq(nodes.auth_secret, authSecret),
        eq(nodes.enabled, 1)
      )
    )
    .get();

  if (!node) return { ok: false };

  // 2. 根据密码查找用户
  const user = db
    .select({
      id: users.id,
      name: users.name,
      enabled: users.enabled,
      expires_at: users.expires_at,
      quota_bytes: users.quota_bytes,
      used_bytes: users.used_bytes,
    })
    .from(users)
    .where(eq(users.password, password))
    .get();

  if (!user) return { ok: false };

  // 3. 校验用户状态
  if (user.enabled !== 1) return { ok: false };

  if (user.expires_at && new Date(user.expires_at) < new Date()) {
    return { ok: false };
  }

  if (user.quota_bytes! > 0 && user.used_bytes! >= user.quota_bytes!) {
    return { ok: false };
  }

  // 4. 校验节点权限
  const permission = db
    .select({ user_id: userNodes.user_id })
    .from(userNodes)
    .where(
      and(eq(userNodes.user_id, user.id), eq(userNodes.node_id, nodeId))
    )
    .get();

  if (!permission) return { ok: false };

  // 5. 全部校验通过
  return { ok: true, id: user.name };
}
```

**Step 2: 更新 `src/services/auth.test.ts`**

同理：`Database` → `Db`，`db?.close()` → `db?.$client?.close()`，注释中文化。测试中 `db.run(...)` 改为 `db.$client.run(...)`。

**Step 3: 运行测试**

```bash
bun test src/services/auth.test.ts
```

**Step 4: 提交**

```bash
git add src/services/auth.ts src/services/auth.test.ts
git commit -m "refactor: migrate auth service to Drizzle"
```

---

### Task 6: 迁移 subscription service

**Files:**
- Modify: `src/services/subscription.ts`
- Modify: `src/services/subscription.test.ts`

**Step 1: 重写 `src/services/subscription.ts`**

查询部分改用 Drizzle，渲染函数（renderShadowrocket、renderSingbox、renderClash）不变。

```ts
import { eq } from "drizzle-orm";
import type { Db } from "../db/index";
import { subscriptions, type Subscription, type User, type Node } from "../db/schema";
import { getUser, getUserNodes } from "./user";

export interface SubscriptionWithUrl extends Subscription {
  url?: string;
}

export interface SubscriptionConfig {
  content: string;
  contentType: string;
}

// 生成订阅链接
export function generateSubscription(
  db: Db,
  userId: string,
  format: string,
  baseUrl?: string
): SubscriptionWithUrl {
  const sub = db
    .insert(subscriptions)
    .values({ user_id: userId, format })
    .returning()
    .get() as SubscriptionWithUrl;

  if (baseUrl) {
    sub.url = `${baseUrl}/sub/${sub.token}`;
  }
  return sub;
}

// 列出用户的所有订阅
export function listSubscriptions(db: Db, userId: string): Subscription[] {
  return db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.user_id, userId))
    .all();
}

// 根据 token 获取订阅
export function getSubscriptionByToken(db: Db, token: string): Subscription | null {
  return (
    db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.token, token))
      .get() ?? null
  );
}

// 获取订阅配置内容（根据格式渲染）
export function getSubscriptionConfig(
  db: Db,
  token: string
): SubscriptionConfig | null {
  const sub = getSubscriptionByToken(db, token);
  if (!sub) return null;

  const user = getUser(db, sub.user_id);
  if (!user) return null;

  const nodes = getUserNodes(db, user.id).filter((n) => n.enabled === 1);

  switch (sub.format) {
    case "shadowrocket":
      return {
        content: renderShadowrocket(user, nodes),
        contentType: "text/plain; charset=utf-8",
      };
    case "singbox":
      return {
        content: JSON.stringify(renderSingbox(user, nodes)),
        contentType: "application/json",
      };
    case "clash":
      return {
        content: renderClash(user, nodes),
        contentType: "text/yaml; charset=utf-8",
      };
    default:
      return null;
  }
}

// --- 渲染函数（纯函数，不涉及 DB 操作） ---

function buildHy2Uri(
  password: string,
  host: string,
  port: number,
  sni: string | null,
  name: string
): string {
  const serverName = sni || host;
  return `hysteria2://${password}@${host}:${port}/?sni=${serverName}&insecure=0#${name}`;
}

// 渲染 Shadowrocket 格式（Base64 编码的 URI 列表）
export function renderShadowrocket(user: User, nodes: Node[]): string {
  const lines = nodes.map((n) =>
    buildHy2Uri(user.password, n.host, n.port, n.sni, n.name)
  );
  return btoa(lines.join("\n"));
}

// 渲染 Sing-box JSON 配置
export function renderSingbox(user: User, nodes: Node[]): any {
  // ... 内容不变，与当前实现完全相同 ...
  const nodeNames = nodes.map((n) => n.name);
  const hy2Outbounds = nodes.map((n) => ({
    type: "hysteria2",
    tag: n.name,
    server: n.host,
    server_port: n.port,
    password: user.password,
    tls: { enabled: true, server_name: n.sni || n.host },
  }));

  return {
    log: { level: "info" },
    dns: {
      servers: [
        { tag: "google", address: "https://dns.google/dns-query" },
        { tag: "local", address: "223.5.5.5", detour: "direct" },
      ],
      rules: [{ geosite: "cn", server: "local" }],
    },
    inbounds: [
      {
        type: "tun",
        tag: "tun-in",
        inet4_address: "172.19.0.1/30",
        auto_route: true,
        strict_route: true,
        stack: "system",
      },
    ],
    outbounds: [
      {
        type: "selector",
        tag: "proxy",
        outbounds: [...nodeNames, "auto", "direct"],
        default: "auto",
      },
      { type: "urltest", tag: "auto", outbounds: [...nodeNames], interval: "5m" },
      ...hy2Outbounds,
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" },
      { type: "dns", tag: "dns-out" },
    ],
    route: {
      rules: [
        { protocol: "dns", outbound: "dns-out" },
        { geosite: "cn", geoip: "cn", outbound: "direct" },
        { geosite: "category-ads-all", outbound: "block" },
      ],
      auto_detect_interface: true,
    },
  };
}

// 渲染 Clash YAML 配置
export function renderClash(user: User, nodes: Node[]): string {
  // ... 内容不变，与当前实现完全相同 ...
  const proxies = nodes
    .map((n) => {
      const sni = n.sni || n.host;
      return `  - name: "${n.name}"
    type: hysteria2
    server: ${n.host}
    port: ${n.port}
    password: "${user.password}"
    sni: ${sni}`;
    })
    .join("\n\n");

  const nodeNames = nodes.map((n) => `      - ${n.name}`).join("\n");

  return `mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: true

dns:
  enable: true
  enhanced-mode: fake-ip
  nameserver:
    - https://dns.google/dns-query
  fallback:
    - https://1.1.1.1/dns-query
  fallback-filter:
    geoip: true
    geoip-code: CN

proxies:
${proxies}

proxy-groups:
  - name: Proxy
    type: select
    proxies:
      - Auto
${nodeNames}
      - DIRECT

  - name: Auto
    type: url-test
    proxies:
${nodeNames}
    url: http://www.gstatic.com/generate_204
    interval: 300

rules:
  - GEOSITE,category-ads-all,REJECT
  - GEOIP,CN,DIRECT
  - GEOSITE,CN,DIRECT
  - MATCH,Proxy
`;
}

export type { Subscription } from "../db/schema";
```

**Step 2: 更新 `src/services/subscription.test.ts`**

同理：类型更新 + 注释中文化。

**Step 3: 运行测试**

```bash
bun test src/services/subscription.test.ts
```

**Step 4: 提交**

```bash
git add src/services/subscription.ts src/services/subscription.test.ts
git commit -m "refactor: migrate subscription service to Drizzle"
```

---

### Task 7: 迁移 traffic service

**Files:**
- Modify: `src/services/traffic.ts`
- Modify: `src/services/traffic.test.ts`

**Step 1: 重写 `src/services/traffic.ts`**

```ts
import { eq, and, gte, lt, sql } from "drizzle-orm";
import type { Db } from "../db/index";
import { nodes, users, trafficLogs, type Node } from "../db/schema";

export interface SyncResult {
  nodeId: string;
  synced: number;
  errors: string[];
}

export interface TrafficFilters {
  userId?: string;
  nodeId?: string;
  from?: string;
  to?: string;
}

export interface TrafficStat {
  userId: string;
  nodeId: string;
  txBytes: number;
  rxBytes: number;
  recordedAt: string;
}

// 从单个节点同步流量数据
export async function syncTrafficFromNode(
  db: Db,
  node: Node
): Promise<SyncResult> {
  const result: SyncResult = { nodeId: node.id, synced: 0, errors: [] };

  let data: Record<string, { tx: number; rx: number }>;
  try {
    const res = await fetch(
      `http://${node.host}:${node.stats_port}/traffic?clear=1`,
      { headers: { Authorization: node.stats_secret! } }
    );
    if (!res.ok) {
      result.errors.push(`HTTP ${res.status} from node ${node.name}`);
      return result;
    }
    data = await res.json();
  } catch (err: any) {
    result.errors.push(`Fetch failed for node ${node.name}: ${err.message}`);
    return result;
  }

  for (const [username, traffic] of Object.entries(data)) {
    const totalBytes = traffic.tx + traffic.rx;
    if (totalBytes === 0) continue;

    // 根据用户名查找用户
    const user = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.name, username))
      .get();

    if (!user) {
      result.errors.push(`Unknown user: ${username}`);
      continue;
    }

    // 写入流量日志
    db.insert(trafficLogs)
      .values({
        user_id: user.id,
        node_id: node.id,
        tx_bytes: traffic.tx,
        rx_bytes: traffic.rx,
      })
      .run();

    // 累加用户已用流量
    db.update(users)
      .set({ used_bytes: sql`used_bytes + ${totalBytes}` })
      .where(eq(users.id, user.id))
      .run();

    result.synced++;
  }

  return result;
}

// 同步所有已启用且配置了 stats_port 的节点
export async function syncAllNodes(db: Db): Promise<SyncResult[]> {
  const enabledNodes = db
    .select()
    .from(nodes)
    .where(and(eq(nodes.enabled, 1), sql`${nodes.stats_port} IS NOT NULL`))
    .all();

  const results: SyncResult[] = [];
  for (const node of enabledNodes) {
    const result = await syncTrafficFromNode(db, node);
    results.push(result);
  }
  return results;
}

// 查询流量统计（支持多维度筛选）
export function getTrafficStats(db: Db, filters?: TrafficFilters): TrafficStat[] {
  const conditions = [];

  if (filters?.userId) conditions.push(eq(trafficLogs.user_id, filters.userId));
  if (filters?.nodeId) conditions.push(eq(trafficLogs.node_id, filters.nodeId));
  if (filters?.from) conditions.push(gte(trafficLogs.recorded_at, filters.from));
  if (filters?.to) conditions.push(lt(trafficLogs.recorded_at, filters.to));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select({
      user_id: trafficLogs.user_id,
      node_id: trafficLogs.node_id,
      tx_bytes: trafficLogs.tx_bytes,
      rx_bytes: trafficLogs.rx_bytes,
      recorded_at: trafficLogs.recorded_at,
    })
    .from(trafficLogs)
    .where(where)
    .all();

  return rows.map((r) => ({
    userId: r.user_id!,
    nodeId: r.node_id!,
    txBytes: r.tx_bytes!,
    rxBytes: r.rx_bytes!,
    recordedAt: r.recorded_at!,
  }));
}

// 启动定时流量同步
export function startTrafficSync(db: Db, intervalMs: number): Timer {
  return setInterval(() => {
    syncAllNodes(db).catch((err) => {
      console.error("Traffic sync failed:", err);
    });
  }, intervalMs);
}
```

**Step 2: 更新 `src/services/traffic.test.ts`**

同理：类型更新 + 注释中文化。测试中 `db.run(...)` / `db.query(...)` 改为 `db.$client.run(...)` / `db.$client.query(...)`。

**Step 3: 运行测试**

```bash
bun test src/services/traffic.test.ts
```

**Step 4: 提交**

```bash
git add src/services/traffic.ts src/services/traffic.test.ts
git commit -m "refactor: migrate traffic service to Drizzle"
```

---

### Task 8: 更新 MCP 工具层

**Files:**
- Modify: `src/mcp/index.ts`
- Modify: `src/mcp/tools/users.ts`
- Modify: `src/mcp/tools/nodes.ts`
- Modify: `src/mcp/tools/subscriptions.ts`
- Modify: `src/mcp/tools/monitoring.ts`
- Modify: `src/mcp/tools/ops.ts`

**Step 1: 更新所有 MCP 工具的 db 类型**

核心变更：
- `import type { Database } from "bun:sqlite"` → `import type { Db } from "../../db/index"`
- 函数签名中 `db: Database` → `db: Db`
- `src/mcp/tools/subscriptions.ts` 中的 raw SQL (`db.run(...)`, `db.query(...)`) 改为使用 Drizzle 查询或 service 函数
- `src/mcp/tools/monitoring.ts` 中的 raw SQL 改为 Drizzle 查询
- MCP 工具描述保持英文（面向 LLM agent）

**`src/mcp/tools/subscriptions.ts` 的关键变更：**

```ts
// 之前（raw SQL）
db.run("INSERT INTO subscriptions ...", [id, user_id, token, format]);
const subs = db.query("SELECT * FROM subscriptions WHERE user_id = ?").all(user_id);

// 之后（使用 service 函数）
import { generateSubscription, listSubscriptions } from "../../services/subscription";
const sub = generateSubscription(db, user_id, format, baseUrl);
const subs = listSubscriptions(db, user_id);
```

**`src/mcp/tools/monitoring.ts` 的关键变更：**

```ts
// 之前（raw SQL）
const row = db.query("SELECT COALESCE(SUM(...)) FROM traffic_logs WHERE 1=1 ...").get(...);

// 之后（Drizzle）
import { sql, eq, and } from "drizzle-orm";
import { trafficLogs } from "../../db/schema";

const conditions = [];
if (user_id) conditions.push(eq(trafficLogs.user_id, user_id));
if (node_id) conditions.push(eq(trafficLogs.node_id, node_id));
const where = conditions.length > 0 ? and(...conditions) : undefined;

const row = db
  .select({
    total_tx: sql<number>`COALESCE(SUM(${trafficLogs.tx_bytes}), 0)`,
    total_rx: sql<number>`COALESCE(SUM(${trafficLogs.rx_bytes}), 0)`,
  })
  .from(trafficLogs)
  .where(where)
  .get();
```

**Step 2: 更新 `src/mcp/index.ts`**

```ts
import type { Db } from "../db/index";
// ... 其余不变，仅 db 类型从 Database 改为 Db
```

**Step 3: 运行 MCP 相关测试（如有）**

```bash
bun test src/mcp/
```

**Step 4: 提交**

```bash
git add src/mcp/
git commit -m "refactor: update MCP tools to use Drizzle db type"
```

---

### Task 9: 更新 HTTP 层 + 入口文件

**Files:**
- Modify: `src/http/index.ts`
- Modify: `src/http/index.test.ts` (如有)
- Modify: `src/index.ts`
- Modify: `src/config.ts` (注释中文化)
- Modify: `src/config.test.ts` (注释中文化，如有)

**Step 1: 更新 `src/http/index.ts`**

```ts
import { Hono } from "hono";
import type { Db } from "../db/index";
import { authenticate } from "../services/auth";
import { getUser, getUserNodes } from "../services/user";
import {
  getSubscriptionByToken,
  renderShadowrocket,
  renderSingbox,
  renderClash,
} from "../services/subscription";

export function createHttpApp(db: Db, _baseUrl: string): Hono {
  // ... 路由逻辑不变，仅 db 类型改变
}
```

**Step 2: 更新 `src/index.ts`**

```ts
// initDatabase 返回 Drizzle 实例，后续传递给各模块
const db = initDatabase(config.dbPath);
// ...
// 优雅关闭时关闭底层 SQLite
process.on("SIGINT", () => {
  console.log("Shutting down...");
  clearInterval(syncTimer);
  server.stop();
  db.$client.close();  // 关闭底层 SQLite 连接
  process.exit(0);
});
```

**Step 3: 注释中文化**

将 `src/config.ts`、`src/index.ts`、`src/http/index.ts` 中的英文注释改为中文。

**Step 4: 提交**

```bash
git add src/http/ src/index.ts src/config.ts src/config.test.ts
git commit -m "refactor: update HTTP layer and entry point for Drizzle"
```

---

### Task 10: 更新集成测试 + 全量验证

**Files:**
- Modify: `src/integration.test.ts`

**Step 1: 更新 `src/integration.test.ts`**

```ts
import { initDatabase, type Db } from "./db/index";
// ... 其余 import 保持不变

let db: Db;

beforeEach(() => {
  db = initDatabase(":memory:");
  app = createHttpApp(db, BASE_URL);
});

afterEach(() => {
  db.$client.close();
});

// 测试中 db.run(...) 改为 db.$client.run(...)
// 注释改为中文
```

**Step 2: 运行全量测试**

```bash
bun test
```

预期：所有测试通过。

**Step 3: 提交**

```bash
git add src/integration.test.ts
git commit -m "refactor: update integration tests for Drizzle"
```

**Step 4: 最终检查**

```bash
# 确认无遗留的 bun:sqlite Database 类型引用（db/index.ts 的 import 除外）
grep -r "from \"bun:sqlite\"" src/ --include="*.ts" | grep -v "src/db/index.ts"

# 确认无遗留的英文注释（MCP 工具描述和日志输出除外）
# 人工检查即可
```
