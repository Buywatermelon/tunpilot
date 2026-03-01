# TunPilot — Agent-Native 代理节点管理服务

## 定位

TunPilot 是一个 agent-native 的代理节点管理服务。区别于传统面板（H-UI、3X-UI）以 Web UI 为核心，TunPilot 以 MCP 为主要接口，设计上就是给 LLM Agent 操控的。

使用模式：**用户 → LLM Agent（Claude Code / OpenClaw）→ TunPilot**

## 架构

```
┌──────────────────────────────────────────────────────┐
│  LLM Agent (Claude Code / OpenClaw)                   │
│                                                       │
│  日常操作: MCP → TunPilot                              │
│  运维操作: SSH → 节点 (依据 TunPilot 提供的信息)         │
│                                                       │
│  Skill 层（客户端侧编排）:                               │
│    onboard-user / node-health-check /                 │
│    deploy-node / renew-cert                           │
└───────┬───────────────────────┬───────────────────────┘
        │ MCP (Streamable HTTP) │ SSH (偶尔，Agent 自行执行)
        ▼                       ▼
┌───────────────┐        ┌─────────────┐
│  TunPilot     │ ←HTTP→ │  代理节点     │
│  (Bun.js)     │  认证    │  Hysteria2  │
│               │  流量    │  (未来: 更多) │
│  MCP Server   │        │             │
│  HTTP Server  │        │             │
│  SQLite       │        │             │
└───────────────┘        └─────────────┘
```

### 分层设计

```
Skill 层（客户端侧）    编排多步工作流，如"新用户入网"
    ↓ 调用
MCP 层（~15-20 tools）  原子操作，LLM 自主决定调用哪个
    ↓ 调用
Service 层              核心业务逻辑，MCP 和 HTTP 共享
    ↓
Data 层                 SQLite (bun:sqlite)
```

### 关键设计决策

1. **MCP 是主要接口**，HTTP 端点只覆盖 MCP 做不了的事（订阅下载、认证回调、健康探针）
2. **TunPilot 不持有 SSH 能力**，节点运维（部署、证书更换）由 Agent 通过 SSH 完成，TunPilot 只提供所需信息
3. **利用 Hysteria2 原生 HTTP Auth 回调**，用户 CRUD 只改本地数据库，节点实时回调认证，无需推送配置到节点
4. **协议可扩展**，虽然当前全部是 Hysteria2，但 Service 层按协议抽象，未来可接入 VLESS、Shadowsocks 等

## 节点交互方式

不用 SSH，不用 H-UI。利用 Hysteria2 原生能力：

| 操作 | 方向 | 机制 |
|------|------|------|
| 用户认证 | 节点 → TunPilot | Hysteria2 `auth: type: http`，每次用户连接时 POST 到 TunPilot |
| 流量查询 | TunPilot → 节点 | HTTP GET 节点的 `trafficStats` API |
| 用户 CRUD | 仅 TunPilot 本地 | 改 SQLite，下次连接时认证回调自动生效 |
| 订阅下载 | 客户端 → TunPilot | HTTP GET /sub/:token |
| 节点运维 | Agent → 节点 | Agent 通过 SSH 执行，TunPilot 提供配置模板和指南 |

## 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| 运行时 | Bun.js | 性能好，内置 SQLite |
| 数据库 | SQLite (bun:sqlite) | 轻量，零外部依赖 |
| HTTP 框架 | Hono | 轻量、Bun 原生支持 |
| MCP SDK | @modelcontextprotocol/sdk | 官方 TypeScript SDK |
| MCP 传输 | Streamable HTTP | 支持远程连接（部署在 VPS 上） |

## MCP Tools 清单

### 用户管理
- `list_users` — 列出所有用户及状态
- `create_user` — 创建用户（名称、密码、配额、到期时间）
- `update_user` — 修改用户配置
- `delete_user` — 删除用户
- `reset_traffic` — 重置用户流量计数

### 节点与监控
- `list_nodes` — 列出所有节点及在线状态
- `get_node_info` — 节点详情（IP、配置路径、证书状态、版本）
- `check_health` — 检查所有节点连通性 + 认证回调是否正常
- `get_traffic_stats` — 查询指定节点/用户的流量统计

### 订阅
- `generate_subscription` — 为指定用户生成订阅链接
- `list_subscriptions` — 列出用户的订阅
- `get_subscription_config` — 预览订阅内容（调试用）

### 运维辅助（提供信息，不执行操作）
- `get_deploy_template` — 获取节点部署所需的 Hysteria2 配置模板
- `get_cert_status` — 各节点证书到期信息
- `get_setup_guide` — 新节点接入指南（Agent 照着 SSH 执行）

## HTTP 端点

```
POST /auth              ← Hysteria2 认证回调（各节点调用）
GET  /sub/:token        ← 客户端订阅下载（Shadowrocket/sing-box/Clash）
GET  /health            ← 健康探针
```

## 数据模型

```sql
nodes (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,         -- 显示名称，如 "BWG-US"
  host          TEXT NOT NULL,         -- 节点地址
  port          INTEGER NOT NULL,      -- 代理端口
  protocol      TEXT NOT NULL,         -- "hysteria2" (未来: "vless", "ss" 等)
  stats_port    INTEGER,               -- 流量统计 API 端口
  stats_secret  TEXT,                  -- 流量统计 API 密钥
  cert_path     TEXT,                  -- 证书路径（信息记录，Agent 运维用）
  cert_expires  TEXT,                  -- 证书到期时间
  hy2_version   TEXT,                  -- Hysteria2 版本
  config_path   TEXT,                  -- 配置文件路径（信息记录）
  ssh_user      TEXT,                  -- SSH 用户名（Agent 运维用）
  enabled       INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now'))
)

users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  password      TEXT NOT NULL,         -- Hysteria2 auth 密码（明文，协议要求）
  quota_bytes   INTEGER DEFAULT 0,     -- 0 = 无限制
  used_bytes    INTEGER DEFAULT 0,
  expires_at    TEXT,                  -- NULL = 永不过期
  max_devices   INTEGER DEFAULT 3,
  enabled       INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now'))
)

user_nodes (
  user_id       TEXT REFERENCES users(id),
  node_id       TEXT REFERENCES nodes(id),
  PRIMARY KEY (user_id, node_id)
)

subscriptions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES users(id),
  token         TEXT NOT NULL UNIQUE,  -- 订阅链接中的 token
  format        TEXT NOT NULL,         -- "shadowrocket", "singbox", "clash"
  created_at    TEXT DEFAULT (datetime('now'))
)

traffic_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT REFERENCES users(id),
  node_id       TEXT REFERENCES nodes(id),
  tx_bytes      INTEGER DEFAULT 0,
  rx_bytes      INTEGER DEFAULT 0,
  recorded_at   TEXT DEFAULT (datetime('now'))
)
```

## 订阅生成

订阅链接格式：`https://tunpilot.example.com/sub/:token`

客户端 GET 该 URL 后，TunPilot 根据 token 查找用户，获取其可访问的节点列表，结合分流规则模板，渲染出完整的客户端配置：

- **Shadowrocket**: .conf 格式（节点 + 分流规则）
- **sing-box**: JSON 格式
- **Clash**: YAML 格式

分流规则从现有 Gist 模板迁移，作为默认模板存入数据库或配置文件。

## Skill 层（客户端侧，后续编写）

| Skill | 流程 |
|-------|------|
| `onboard-user` | create_user → 分配节点 → generate_subscription → 发送链接 |
| `node-health-check` | check_health → get_traffic_stats → get_cert_status → 汇总报告 |
| `deploy-node` | get_deploy_template → Agent SSH 部署 → check_health 验证 → 注册节点 |
| `renew-cert` | get_cert_status → Agent SSH 更换证书 → 重启服务 → 验证 |

## 部署

- 部署在某台 VPS 上（具体待定）
- 单进程 Bun.js 服务
- 需要各节点的 Hysteria2 配置 `auth: type: http` 指向 TunPilot
- 通过 Tailscale 内网或公网访问
