# TunPilot

Hysteria2 / Xray(Trojan) 代理节点管理服务。提供 Web Admin、REST API、CLI 三种等价入口，配套 Claude Code / OpenClaw Skill 让 Agent 全流程驱动部署。

```
Web Admin ─┐
CLI        ├──► TunPilot (REST API) ──► Hysteria2 / Xray 节点
Agent      ─┘
```

## 核心功能

- **节点管理** — 注册、更新、启用/禁用 Hysteria2 / Xray(Trojan) 代理节点
- **用户管理** — 创建用户、分配节点权限、设置流量配额和有效期
- **订阅生成** — 支持 Sing-box、Clash、Surge、Shadowrocket 格式（nodes-only，分流规则由客户端管理）
- **流量监控** — 自动从节点同步流量数据，实时配额检查
- **节点诊断** — 通过 SSH 直连节点执行 IP 质量扫描（风控得分、流媒体解锁）和网络测速（路由、延迟）
- **节点侧认证** — Hysteria2 使用原生 `userpass`，TunPilot 通过 SSH 异步下发配置，不处于鉴权热路径

## 效果演示

无需寻找第三方评测脚本与各种探针面板，所有操作均通过 Agent 在终端中对话完成并渲染输出报告：

<img src="docs/assets/diagnostics-demo.gif" alt="Node Diagnostics Showcase" width="720">

## 快速开始

### 1. 部署服务器

一条命令完成 Bun 安装、仓库克隆、systemd 注册、Web Admin 构建、首次启动：

```bash
ssh <server> "curl -fsSL https://raw.githubusercontent.com/Buywatermelon/tunpilot/main/scripts/deploy.sh | bash"
```

脚本会生成 `TUNPILOT_AUTH_TOKEN` 并打印出来，同时给出 Web Admin 地址和 CLI 安装指引。

### 2. 选一种方式管理

**浏览器**：打开 `http://<server>:3000`，粘贴 token 登录即可。

**CLI**：

```bash
bun install -g github:Buywatermelon/tunpilot
tunpilot config set server http://<server>:3000
tunpilot config set token <token>
tunpilot node list
```

**Agent（推荐）**：安装 [Claude Code 插件](plugin/README.md) 或 [OpenClaw 插件](openclaw/README.md)，之后直接自然语言：

```
> 部署一个新的 Hysteria2 节点
> 创建用户 alice，流量配额 50GB
> 给 alice 生成 Shadowrocket 订阅链接
> 查看所有用户本月的流量统计
```

Agent 会加载对应 Skill 并把请求翻译为 CLI 调用。

## 架构

```
src/                           # 服务端
├── index.ts                   # 入口：Hono 服务器 + 静态 Web Admin + 流量同步 + 节点对账
├── api/                       # REST API 路由（/api/v1/*）
│   ├── nodes.ts               # 节点 CRUD
│   ├── users.ts               # 用户 CRUD + 节点分配 + 订阅
│   ├── subscriptions.ts       # 订阅列表/删除
│   ├── monitoring.ts          # 健康检查 / 流量统计
│   └── settings.ts            # 配置项管理
├── http/                      # 非 API 路由
│   └── index.ts               # /sub/:token 订阅下载 + /health 健康检查
├── services/                  # 业务层
│   ├── node.ts, user.ts       # 基础 CRUD
│   ├── user-ops.ts            # 节点权限分配 + 协议配置下发
│   ├── subscription.ts        # 订阅生命周期
│   ├── traffic.ts             # 流量同步 + 统计
│   ├── health.ts              # 节点健康检查
│   ├── hysteria/              # Hysteria2 sync + stats（支持 SSH 隧道）
│   ├── xray/                  # Xray/Trojan gRPC sync
│   ├── formats/               # 订阅格式渲染器（sing-box / clash / surge / shadowrocket）
│   └── settings.ts            # 配置项
└── db/                        # Drizzle ORM schema + 初始化（WAL）

web/                           # Web Admin（React 19 + Vite 6 + Tailwind v4）
├── src/
│   ├── app.tsx                # 路由
│   ├── components/            # UI 原语（Card / Dialog / Input / ...）
│   ├── pages/                 # Dashboard / Users / Nodes / Subscriptions / Login
│   └── lib/api.ts             # Bearer 认证的 fetch 封装
└── vite.config.ts

cli/                           # tunpilot CLI
├── index.ts                   # arg 解析 + 命令分发
├── client.ts                  # REST 调用
├── config.ts                  # ~/.config/tunpilot/config.json
└── commands/
    ├── node.ts                # tunpilot node list/add/update/remove/sync
    ├── user.ts                # tunpilot user list/create/update/delete/reset-traffic
    ├── sub.ts                 # tunpilot sub list/create/delete
    ├── health.ts              # tunpilot health
    ├── traffic.ts             # tunpilot traffic
    └── setting.ts             # tunpilot setting list/set

skills/                        # Agent Skill（CI 自动同步到 plugin/skills/）
├── getting-started/           # 部署服务 + 配置 CLI
├── deploying-hy2-nodes/       # 部署 Hysteria2 节点
├── deploying-xray-nodes/      # 部署 Xray/Trojan 节点
└── testing-nodes/             # 节点诊断与测速
```

### 数据模型

```
nodes ──┐
        ├── user_nodes（多对多）──┐
users ──┘                         ├── subscriptions
                                  └── traffic_logs
settings         # 配置项（API key 等）
```

- **nodes** — 代理节点配置（host、port、stats、SSH、订阅元数据等）
- **users** — 用户账号（密码、配额、有效期）
- **user_nodes** — 用户与节点的多对多权限关系
- **subscriptions** — 订阅链接（token + 格式）
- **traffic_logs** — 历史流量记录
- **settings** — 系统配置项（API key、token 等，值加密存储）

### Hysteria2 管理流程

```
用户/节点变更 → TunPilot → SSH 写入 Hysteria2 config.yaml
                    ↓
         auth.type = userpass
         trafficStats.listen = 127.0.0.1:9999（有 SSH 时）
                    ↓
            systemctl reload hysteria-server
```

TunPilot 负责维护节点上的 `userpass` 和 `trafficStats` 配置，但不参与每次连接鉴权。流量采集优先通过 SSH 隧道访问本地 stats 端口，避免暴露到公网。

### HTTP 端点

| 端点 | 用途 | 认证 |
|------|------|------|
| `GET /` | Web Admin SPA | — |
| `POST/GET /api/v1/*` | REST API | Bearer `TUNPILOT_AUTH_TOKEN` |
| `GET /sub/:token` | 订阅配置下载（客户端消费） | Token 即权限 |
| `GET /health` | 健康检查 | — |

## REST API 快速参考

| 资源 | 方法 | 路径 |
|------|------|------|
| 节点 | `GET/POST/PATCH/DELETE` | `/api/v1/nodes[/:id]` |
| 节点同步 | `POST` | `/api/v1/nodes/sync` |
| 用户 | `GET/POST/PATCH/DELETE` | `/api/v1/users[/:id]` |
| 用户节点分配 | `PUT` | `/api/v1/users/:id/nodes` |
| 重置流量 | `POST` | `/api/v1/users/:id/reset-traffic` |
| 订阅 | `GET/DELETE` | `/api/v1/subscriptions[/:id]` |
| 新建订阅 | `POST` | `/api/v1/users/:id/subscriptions` |
| 健康检查 | `GET` | `/api/v1/health` |
| 流量统计 | `GET` | `/api/v1/traffic?user_id=&node_id=&from=&to=` |
| 设置项 | `GET/POST/DELETE` | `/api/v1/settings[/:key]` |

## CLI 快速参考

```
tunpilot node    list|add|update|remove|sync
tunpilot user    list|create|update|delete|reset-traffic
tunpilot sub     list|create|delete
tunpilot health  [<node-id>]
tunpilot traffic --user <id> --node <id> --from <date> --to <date>
tunpilot setting list|set <key> <value>
tunpilot config  set server|token <value>
```

## 技术栈

| 组件 | 技术 |
|------|------|
| 运行时 | [Bun](https://bun.sh) |
| HTTP 框架 | [Hono](https://hono.dev) |
| 数据库 | SQLite（bun:sqlite，WAL 模式） |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| Web Admin | React 19 + Vite 6 + Tailwind CSS v4 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TUNPILOT_PORT` | `3000` | 监听端口 |
| `TUNPILOT_HOST` | `0.0.0.0` | 监听地址 |
| `TUNPILOT_DB_PATH` | `./data/tunpilot.db` | SQLite 数据库路径 |
| `TUNPILOT_BASE_URL` | `http://localhost:3000` | 外部可访问的基础 URL（影响订阅链接） |
| `TUNPILOT_AUTH_TOKEN` | *(空)* | Web Admin / REST API Bearer Token |
| `TRAFFIC_SYNC_INTERVAL` | `300000` | 流量同步间隔，毫秒（默认 5 分钟） |
| `RECONCILE_INTERVAL` | `600000` | 节点对账间隔，毫秒（默认 10 分钟） |
| `TRAFFIC_RETENTION_DAYS` | `90` | 流量日志保留天数 |

## 开发

```bash
bun install
bun test               # 服务端 + CLI 测试
(cd web && bun install && bun run dev)   # 前端开发（5173 端口，代理到 3000）
bun run dev            # 后端热重载
```

## Agent 分发

| 渠道 | 目录 | 说明 |
|------|------|------|
| Claude Code Plugin | [`plugin/`](plugin/README.md) | 分发 Skill，通过 `/plugin install` 安装 |
| OpenClaw Plugin | [`openclaw/`](openclaw/README.md) | 分发 Skill + OpenClaw 环境变量 |

两个渠道共享 `skills/` 目录下的 Skill 内容，发布时由 CI 复制到各分发目录。

## License

MIT
