# Drizzle ORM 迁移 + 注释中文化

## 概述

将 TunPilot 的数据库层从 raw SQL（bun:sqlite）迁移到 Drizzle ORM，同时将所有代码注释改为中文。

## 决策

- **ORM**: Drizzle ORM（轻量、类型安全、原生支持 bun:sqlite）
- **迁移策略**: drizzle-kit push（直接同步 schema 到数据库，无迁移文件）
- **Services 分包**: 不分包（当前 5 个文件职责清晰，行数合理）
- **注释语言**: 中文（MCP 工具描述和日志输出保持英文）

## 架构变更

### 新增依赖

- `drizzle-orm` — 运行时依赖
- `drizzle-kit` — 开发依赖（用于 push schema）

### 文件结构

```
src/db/
  schema.ts    ← 新增：Drizzle schema 定义（5 张表）
  index.ts     ← 重写：初始化 drizzle 实例
```

### Schema 定义（src/db/schema.ts）

用 `sqliteTable` 定义 5 张表（nodes, users, user_nodes, subscriptions, traffic_logs），类型从 schema 推导：

```ts
export type Node = typeof nodes.$inferSelect;
export type NewNode = typeof nodes.$inferInsert;
```

### 数据库初始化（src/db/index.ts）

```ts
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

export function initDatabase(path: string) {
  const sqlite = new Database(path);
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");
  return drizzle(sqlite, { schema });
}
```

建表改用 `bunx drizzle-kit push`，不再在代码中 CREATE TABLE。

### Service 层改造

所有 service 函数的 `db: Database` 参数改为 Drizzle 的类型化数据库实例。查询从 raw SQL 改为 Drizzle 查询构建器。

动态 UPDATE 简化为 `db.update(table).set(updates).where(eq(...))`.

### 注释中文化

- 行内注释 → 中文
- MCP 工具描述 → 保持英文（面向 LLM agent）
- console.log 输出 → 保持英文（面向运维日志）

## 影响范围

| 文件 | 改动 |
|------|------|
| `src/db/schema.ts` | 新建 — Drizzle schema 定义 |
| `src/db/index.ts` | 重写 — Drizzle 初始化 |
| `src/services/*.ts` | 重写 — Drizzle 查询 + 中文注释 |
| `src/http/index.ts` | 小改 — db 类型变更 |
| `src/index.ts` | 小改 — 初始化方式变更 |
| `src/mcp/**` | 小改 — db 类型变更 |
| `src/**/*.test.ts` | 重写 — 适配 Drizzle |
| `drizzle.config.ts` | 新建 — drizzle-kit 配置 |
| `package.json` | 新增依赖和脚本 |
