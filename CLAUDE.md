# TunPilot

Hysteria2 / Xray(Trojan) 代理节点管理服务，通过 MCP 供 LLM Agent 操作，无 Web UI。

## 技术栈

- **运行时**: Bun（非 Node.js）
- **HTTP**: Hono
- **数据库**: SQLite via Drizzle ORM (`bun:sqlite`)
- **MCP**: `@modelcontextprotocol/sdk` + `@hono/mcp`

## 常用命令

```sh
bun run dev       # 热重载开发
bun run start     # 生产启动
bun test          # 运行测试
bun run db:push   # 同步 Drizzle schema 到 SQLite
```

## 规范

- 使用 Bun API：`bun:sqlite`、`Bun.serve()`、`Bun.file()`、`bun test`
- 禁止使用：express、better-sqlite3、dotenv、node:fs readFile/writeFile
- 测试使用 `bun:test` + 内存 SQLite (`initDatabase(":memory:")`)
- 数据表主键均为 UUID（`trafficLogs` 除外，使用自增）
- 所有外键关系使用 `ON DELETE CASCADE`
- `skills/` 是 Skill 的唯一来源，CI 自动同步到 `plugin/skills/`，禁止手动复制
- 增删 Skill 时需 bump `plugin/.claude-plugin/plugin.json` 的 version（marketplace 按版本号缓存）

## 分流规则架构

三层分离：Catalog（匹配什么）→ routing_rules 表（执行什么动作）→ Renderers（按格式输出）

- **Catalog** (`src/services/routing/catalog.ts`)：16 个静态分类（openai/netflix/cn/ads 等），每个定义 sing-box/Clash/Surge 三种格式的上游 URL
- **routing_rules 表**：动态绑定，key→action 映射，支持 strict 模式（宁断不降）
- **上游源**：sing-box 用 MetaCubeX .srs，Clash/Surge 用 blackmatrix7 远程规则
- **MCP 工具**：list_rule_sets / list_routing_rules / set_routing_rule / remove_routing_rule
