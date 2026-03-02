# TunPilot

Agent-native 代理节点管理服务。通过 MCP (Model Context Protocol) 提供 Hysteria2 节点的全生命周期管理，专为 LLM Agent 设计，无传统 Web UI。

```
用户 → LLM Agent (Claude Code / OpenClaw) → TunPilot MCP → Hysteria2 节点
```

## 核心功能

- **节点管理** — 注册、更新、启用/禁用 Hysteria2 代理节点
- **用户管理** — 创建用户、分配节点权限、设置流量配额和有效期
- **订阅生成** — 支持 Shadowrocket、Sing-box、Clash 三种格式
- **流量监控** — 自动从节点同步流量数据，实时配额检查
- **认证回调** — Hysteria2 节点通过 HTTP 回调验证用户，无需节点侧配置推送

## 快速开始

### 一键部署（生产环境）

```bash
# 在服务器上执行
curl -fsSL https://raw.githubusercontent.com/Buywatermelon/tunpilot/main/scripts/deploy.sh | bash
```

脚本自动完成：安装 Bun → 克隆仓库 → 生成 Token → 创建 systemd 服务 → 启动。
完成后输出 `claude mcp add` 命令，复制粘贴到本地终端即可连接。

### 本地开发

```bash
bun install
export TUNPILOT_BASE_URL=https://tunpilot.example.com
export MCP_AUTH_TOKEN=your-secret-token

# 开发模式（热重载）
bun run dev

# 或生产模式
bun run start
```

服务启动后暴露以下端点：

| 端点 | 用途 |
|------|------|
| `POST /mcp` | MCP Streamable HTTP（Agent 调用入口） |
| `POST /auth/:nodeId/:authSecret` | Hysteria2 认证回调（节点 → TunPilot） |
| `GET /sub/:token` | 订阅配置下载（客户端 → TunPilot） |
| `GET /health` | 健康检查 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TUNPILOT_PORT` | `3000` | 监听端口 |
| `TUNPILOT_HOST` | `0.0.0.0` | 监听地址 |
| `TUNPILOT_DB_PATH` | `./data/tunpilot.db` | SQLite 数据库路径 |
| `TUNPILOT_BASE_URL` | `http://localhost:3000` | 外部可访问的基础 URL（用于生成回调和订阅链接） |
| `MCP_AUTH_TOKEN` | *(空)* | MCP 端点 Bearer Token |
| `TRAFFIC_SYNC_INTERVAL` | `300000` | 流量同步间隔，毫秒（默认 5 分钟） |

## MCP Tools

通过 MCP 暴露 16 个工具，分为四组：

### 节点管理
| 工具 | 说明 |
|------|------|
| `list_nodes` | 列出所有节点 |
| `get_node_info` | 获取节点详情 |
| `add_node` | 注册新节点（自动生成 auth_secret，返回认证回调 URL） |
| `update_node` | 更新节点配置 |
| `remove_node` | 删除节点 |

### 用户管理
| 工具 | 说明 |
|------|------|
| `list_users` | 列出所有用户 |
| `create_user` | 创建用户 |
| `update_user` | 更新用户配置 |
| `delete_user` | 删除用户 |
| `reset_traffic` | 重置用户已用流量 |

### 订阅管理
| 工具 | 说明 |
|------|------|
| `generate_subscription` | 生成订阅链接（shadowrocket / singbox / clash） |
| `list_subscriptions` | 列出用户的所有订阅 |
| `get_subscription_config` | 预览订阅配置内容 |

### 监控
| 工具 | 说明 |
|------|------|
| `check_health` | 检查所有节点状态 |
| `get_traffic_stats` | 查询流量统计 |
| `get_cert_status` | 查看证书到期状态 |

## 架构

```
src/
├── index.ts                 # 入口：启动 HTTP 服务器 + MCP + 流量同步
├── config.ts                # 环境变量配置
├── db/
│   ├── schema.ts            # Drizzle ORM 数据表定义（5 张表）
│   └── index.ts             # 数据库初始化（WAL 模式 + 外键约束）
├── http/
│   └── index.ts             # HTTP 路由（认证回调、订阅下载、健康检查）
├── mcp/
│   ├── index.ts             # MCP 服务器工厂
│   └── tools/
│       ├── nodes.ts         # 节点 CRUD 工具（5 个）
│       ├── users.ts         # 用户 CRUD 工具（5 个）
│       ├── subscriptions.ts # 订阅管理工具（3 个）
│       └── monitoring.ts    # 监控工具（3 个）
└── services/
    ├── auth.ts              # 认证逻辑（节点 → 用户 → 权限 四步校验）
    ├── node.ts              # 节点 CRUD + auth_secret 生成
    ├── user.ts              # 用户 CRUD + 节点权限分配
    ├── subscription.ts      # 订阅渲染（Shadowrocket / Sing-box / Clash）
    └── traffic.ts           # 流量同步 + 统计查询
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

## 技术栈

| 组件 | 技术 |
|------|------|
| 运行时 | [Bun](https://bun.sh) |
| HTTP 框架 | [Hono](https://hono.dev) |
| 数据库 | SQLite（bun:sqlite，WAL 模式） |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| MCP SDK | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) |

## 开发

```bash
# 运行测试
bun test

# 开发模式（热重载）
bun run dev

# Drizzle Studio（数据库可视化）
bun run db:studio
```

## Agent 分发

TunPilot 通过两个独立渠道分发给 Agent 客户端：

| 渠道 | 目录 | 说明 |
|------|------|------|
| Claude Code Plugin | [`plugin/`](plugin/README.md) | Claude Code 插件，配置 MCP 连接 |
| OpenClaw Plugin | [`openclaw/`](openclaw/README.md) | OpenClaw 插件，注册 MCP 服务 + 配置 UI |

两个渠道共享 `skills/` 目录下的 Skill 内容（部署指南、配置模板），发布时由 CI 复制到各分发目录。

```
skills/                  # Skill 唯一真相源
├── deploying-nodes/
│   ├── SKILL.md         # Skill 元数据（超集 frontmatter，兼容两个平台）
│   ├── setup-guide.md   # 节点部署指南
│   └── hysteria2-template.md  # Hysteria2 配置模板
plugin/                  # Claude Code 分发
openclaw/                # OpenClaw 分发
```

## License

MIT
