# TunPilot

Hysteria2 / Xray(Trojan) 代理节点管理服务，Client-Server + CLI 架构。

## 技术栈

- **运行时**: Bun（非 Node.js）
- **HTTP**: Hono
- **数据库**: SQLite via Drizzle ORM (`bun:sqlite`)

## 架构

```
src/                    # Server 端
├── api/                # REST API 路由 (/api/v1/*)
├── services/           # 业务逻辑层
├── db/                 # 数据库层
├── http/               # 订阅端点
└── lib/                # 通用工具

cli/                    # CLI 客户端 (tunpilot)
├── index.ts            # 入口：arg parsing + command dispatch
├── client.ts           # HTTP API client
├── config.ts           # CLI 配置 (~/.config/tunpilot/config.json)
└── commands/           # 命令定义
    ├── node.ts         # tunpilot node list/add/update/remove/sync
    ├── user.ts         # tunpilot user list/create/update/delete/reset-traffic
    ├── sub.ts          # tunpilot sub list/create/delete
    ├── health.ts       # tunpilot health [node-id]
    ├── traffic.ts      # tunpilot traffic --user/--node/--from/--to
    └── setting.ts      # tunpilot setting list/set
```

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

## 订阅架构

节点与规则分离：TunPilot 只输出节点信息，分流规则由用户在客户端自行管理。

- **Surge** → 外部代理列表（`policy-path` 引用）
- **Clash** → proxy-provider 格式（`proxy-providers` 引用）
- **sing-box** → outbounds JSON（outbound provider 引用）
- **Shadowrocket** → base64 编码 URI 列表

## 设置系统

`settings` 表存储 API key 等配置项，值脱敏展示。CLI 命令：`tunpilot setting list` / `tunpilot setting set <key> <value>`

## 客户端格式支持

| 格式 | 实现文件 | 协议 | 内容类型 | 说明 |
|------|---------|------|---------|------|
| **Sing-box** | [src/services/formats/singbox.ts](src/services/formats/singbox.ts) | Hysteria2, Trojan | `application/json` | outbounds JSON 数组，通过 outbound_providers 引用 |
| **Clash** | [src/services/formats/clash.ts](src/services/formats/clash.ts) | Hysteria2, Trojan | `text/yaml` | proxy-provider 格式（仅 proxies 数组），通过 proxy-providers 引用 |
| **Surge** | [src/services/formats/surge.ts](src/services/formats/surge.ts) | Hysteria2, Trojan | `text/plain` | 外部代理列表，通过 policy-path 引用 |
| **Shadowrocket** | [src/services/formats/shadowrocket.ts](src/services/formats/shadowrocket.ts) | Hysteria2, Trojan | `text/plain` (base64) | Base64 编码 URI 列表，hysteria2:// 和 trojan:// 协议 |
