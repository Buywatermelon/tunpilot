# TunPilot

Agent-native 代理节点管理服务。通过 MCP (Model Context Protocol) 提供 Hysteria2 节点的全生命周期管理，专为 LLM Agent 设计，无传统 Web UI。

```
用户 → LLM Agent (Claude Code / OpenClaw) → TunPilot MCP → Hysteria2 节点
```

## 核心功能

- **节点管理** — 注册、更新、启用/禁用 Hysteria2 代理节点
- **用户管理** — 创建用户、分配节点权限、设置流量配额和有效期
- **订阅生成** — 支持 Shadowrocket、Sing-box、Clash、Surge 四种格式
- **流量监控** — 自动从节点同步流量数据，实时配额检查
- **认证回调** — Hysteria2 节点通过 HTTP 回调验证用户，无需节点侧配置推送

## 快速开始

只需两步：安装插件，然后用自然语言让 Agent 完成一切。

### 1. 安装插件

**Claude Code：**

```
/plugin marketplace add https://github.com/Buywatermelon/tunpilot.git
```

```
/plugin install tunpilot@Buywatermelon-tunpilot
```

安装后重启 Claude Code 以加载插件。

**OpenClaw：**

```bash
openclaw plugins install @tunpilot/openclaw-plugin
```

### 2. 对话驱动

安装插件后，直接告诉 Agent 你想做什么：

```
> 帮我在 root@1.2.3.4 上部署 TunPilot 并连接 MCP
```

Agent 会自动加载 `getting-started` skill，引导完成：
1. 验证 SSH 连通性（需要提前配好免密登录）
2. SSH 到你的服务器执行一键部署脚本
3. 配置 MCP 连接
4. 验证连接状态

连接成功后，继续用自然语言管理一切：

```
> 部署一个新的 Hysteria2 节点
> 帮我添加一个新节点，host 是 us1.example.com，端口 443
> 创建用户 alice，流量配额 50GB
> 给 alice 生成 Shadowrocket 订阅链接
> 查看所有用户本月的流量统计
```

## Skill 列表

| Skill | 触发场景 | 作用 |
|-------|---------|------|
| `getting-started` | 部署 TunPilot / 连接 MCP / 首次配置 | 一键部署服务器 + 自动连接 MCP |
| `deploying-nodes` | 部署 Hysteria2 代理节点 | 提供配置模板和分步操作流程 |

## MCP Tools

连接后通过 MCP 暴露 17 个工具，分为四组：

### 节点管理（4 个）
| 工具 | 说明 |
|------|------|
| `list_nodes` | 列出所有节点 |
| `add_node` | 注册新节点（自动生成 auth_secret，返回认证回调 URL） |
| `update_node` | 更新节点配置 |
| `remove_node` | 删除节点 |

### 用户管理（7 个）
| 工具 | 说明 |
|------|------|
| `list_users` | 列出所有用户 |
| `create_user` | 创建用户（Agent 会先确认默认参数） |
| `update_user` | 更新用户配置 |
| `delete_user` | 删除用户 |
| `reset_traffic` | 重置用户已用流量 |
| `assign_nodes` | 分配节点给用户（替换已有分配） |
| `list_user_nodes` | 列出用户已分配的节点 |

### 订阅管理（4 个）
| 工具 | 说明 |
|------|------|
| `generate_subscription` | 生成订阅链接（shadowrocket / singbox / clash / surge） |
| `list_subscriptions` | 列出用户的所有订阅 |
| `delete_subscription` | 删除/吊销订阅 token |
| `get_subscription_config` | 预览订阅配置内容（调试用） |

### 监控（2 个）
| 工具 | 说明 |
|------|------|
| `check_health` | 检查所有节点状态（ping stats API） |
| `get_traffic_stats` | 查询流量统计（支持按用户/节点/时间范围过滤） |

## 架构

```
src/
├── index.ts                 # 入口：启动 HTTP 服务器 + MCP 会话管理 + 流量同步
├── config.ts                # 环境变量配置
├── db/
│   ├── schema.ts            # Drizzle ORM 数据表定义（5 张表）
│   └── index.ts             # 数据库初始化（WAL 模式 + 外键约束）
├── http/
│   └── index.ts             # HTTP 路由（认证回调、订阅下载、健康检查）
├── mcp/
│   ├── index.ts             # MCP 服务器工厂（注册全部 17 个工具）
│   └── tools/
│       ├── nodes.ts         # 节点管理工具（4 个）
│       ├── users.ts         # 用户管理工具（7 个）
│       ├── subscriptions.ts # 订阅管理工具（4 个）
│       └── monitoring.ts    # 监控工具（2 个）
└── services/
    ├── auth.ts              # 认证逻辑（节点 → 用户 → 权限 四步校验）
    ├── node.ts              # 节点 CRUD + auth_secret 生成
    ├── user.ts              # 用户 CRUD + 节点权限分配
    ├── subscription.ts      # 订阅生命周期（生成、列表、删除、token 查询）
    ├── traffic.ts           # 流量同步 + 统计查询
    └── formats/             # 订阅格式渲染器（Format Registry 模式）
        ├── index.ts          # 格式注册表
        ├── shadowrocket.ts
        ├── singbox.ts
        ├── clash.ts
        └── surge.ts
```

### 数据模型

```
nodes ──┐
        ├── user_nodes（多对多）──┐
users ──┘                        ├── subscriptions
                                 └── traffic_logs
```

- **nodes** — 代理节点配置（host、port、auth_secret 等）
- **users** — 用户账号（密码、配额、有效期）
- **user_nodes** — 用户与节点的多对多权限关系
- **subscriptions** — 订阅链接（token + 格式）
- **traffic_logs** — 历史流量记录

### 认证流程

```
Hysteria2 客户端 → Hysteria2 节点 → POST /auth/:nodeId/:authSecret → TunPilot
                                                                        ↓
                                                          校验节点 → 校验用户 → 校验权限
                                                                        ↓
                                                            { ok: true, id: "username" }
```

节点通过 URL 路径中的 `authSecret` 验证身份，TunPilot 校验用户密码、启用状态、有效期、流量配额和节点访问权限。

### HTTP 端点

| 端点 | 用途 |
|------|------|
| `POST /mcp` | MCP Streamable HTTP（Agent 调用入口） |
| `POST /auth/:nodeId/:authSecret` | Hysteria2 认证回调（节点 → TunPilot） |
| `GET /sub/:token` | 订阅配置下载（客户端 → TunPilot） |
| `GET /health` | 健康检查 |

## 技术栈

| 组件 | 技术 |
|------|------|
| 运行时 | [Bun](https://bun.sh) |
| HTTP 框架 | [Hono](https://hono.dev) |
| 数据库 | SQLite（bun:sqlite，WAL 模式） |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| MCP SDK | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TUNPILOT_PORT` | `3000` | 监听端口 |
| `TUNPILOT_HOST` | `0.0.0.0` | 监听地址 |
| `TUNPILOT_DB_PATH` | `./data/tunpilot.db` | SQLite 数据库路径 |
| `TUNPILOT_BASE_URL` | `http://localhost:3000` | 外部可访问的基础 URL |
| `MCP_AUTH_TOKEN` | *(空)* | MCP 端点 Bearer Token |
| `TRAFFIC_SYNC_INTERVAL` | `300000` | 流量同步间隔，毫秒（默认 5 分钟） |

## 开发

```bash
bun install
bun test
bun run dev
```

## Agent 分发

| 渠道 | 目录 | 说明 |
|------|------|------|
| Claude Code Plugin | [`plugin/`](plugin/README.md) | 分发 Skill + MCP 配置模板 |
| OpenClaw Plugin | [`openclaw/`](openclaw/README.md) | 分发 Skill + Gateway MCP 注册 |

两个渠道共享 `skills/` 目录下的 Skill 内容，发布时由 CI 复制到各分发目录。

```
skills/
├── getting-started/              # 部署服务 + 连接 MCP
│   └── SKILL.md
└── deploying-nodes/              # 部署 Hysteria2 节点
    ├── SKILL.md
    └── hysteria2-template.md
```

## License

MIT
