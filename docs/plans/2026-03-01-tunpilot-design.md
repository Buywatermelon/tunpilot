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
MCP 层（~20 tools）     原子操作，LLM 自主决定调用哪个
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
5. **节点管理由 Agent 驱动**，Agent 通过 SSH 完成节点部署后，通过 MCP CRUD 接口将节点信息录入 TunPilot
6. **公网部署，HTTPS 必须**，TunPilot 部署在公网 VPS 上，通过 Caddy 反向代理提供 HTTPS

## 节点交互方式

不用 SSH，不用 H-UI。利用 Hysteria2 原生能力：

| 操作 | 方向 | 机制 |
|------|------|------|
| 用户认证 | 节点 → TunPilot | Hysteria2 `auth: type: http`，每次用户连接时 POST 到 TunPilot |
| 流量同步 | TunPilot → 节点 | 定时轮询节点 `trafficStats` API（每 5 分钟） |
| 用户 CRUD | 仅 TunPilot 本地 | 改 SQLite，下次连接时认证回调自动生效 |
| 订阅下载 | 客户端 → TunPilot | HTTP GET /sub/:token |
| 节点运维 | Agent → 节点 | Agent 通过 SSH 执行，完成后通过 MCP 录入节点信息 |

## 节点注册工作流

Agent 部署新节点的完整流程：

```
1. Agent 调用 get_deploy_template 获取 Hysteria2 配置模板
2. Agent 通过 SSH 连接目标 VPS
3. Agent 安装 Hysteria2、写入配置、申请证书、启动服务
4. Agent 调用 add_node 将节点信息录入 TunPilot
   → TunPilot 自动生成 auth_secret，返回节点的认证回调 URL
5. Agent 通过 SSH 更新节点 Hysteria2 配置中的 auth URL
6. Agent 调用 check_health 验证连通性
```

## 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| 运行时 | Bun.js | 性能好，内置 SQLite |
| 数据库 | SQLite (bun:sqlite) | 轻量，零外部依赖 |
| HTTP 框架 | Hono | 轻量、Bun 原生支持 |
| MCP SDK | @modelcontextprotocol/sdk | 官方 TypeScript SDK |
| MCP 传输 | Streamable HTTP | 支持远程连接（部署在 VPS 上） |
| 反向代理 | Caddy | 自动 HTTPS，零配置证书管理 |

## MCP Tools 清单

### 用户管理
- `list_users` — 列出所有用户及状态
- `create_user` — 创建用户（名称、密码、配额、到期时间）
- `update_user` — 修改用户配置
- `delete_user` — 删除用户
- `reset_traffic` — 重置用户流量计数

### 节点管理
- `list_nodes` — 列出所有节点及在线状态
- `get_node_info` — 节点详情（IP、配置路径、证书状态、版本）
- `add_node` — 注册新节点（Agent SSH 部署完成后调用，自动生成 auth_secret）
- `update_node` — 更新节点信息（端口、证书路径、enabled 等）
- `remove_node` — 删除节点（同时清理 user_nodes 关联）

### 监控
- `check_health` — 检查所有节点连通性 + 认证回调是否正常
- `get_traffic_stats` — 查询指定节点/用户的流量统计（从本地 traffic_logs 查询）

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
POST /auth/:nodeId/:authSecret  ← Hysteria2 认证回调（各节点调用）
GET  /sub/:token                ← 客户端订阅下载（Shadowrocket/sing-box/Clash）
GET  /health                    ← 健康探针
POST /mcp                       ← MCP Streamable HTTP（Agent 调用）
GET  /mcp                       ← MCP SSE 通道
DELETE /mcp                     ← MCP 会话终止
```

## 认证与安全

### MCP 端点认证

Bearer Token 方式，简单直接（单 Agent 场景，不需要 OAuth 2.1 全套）：

- 启动时通过环境变量 `MCP_AUTH_TOKEN` 配置
- MCP Streamable HTTP 挂载在 `/mcp`，每个请求验证 `Authorization: Bearer <token>`
- Token 不存在或不匹配时返回 `401 Unauthorized`

### Auth 回调安全

节点通过公网调用 TunPilot 的认证端点，需要验证请求来源的合法性。

**方案：路径中的 per-node secret**

- 每个节点在 `add_node` 时自动生成唯一的 `auth_secret`（32 字符随机 hex）
- 认证回调 URL 格式：`https://tunpilot.example.com/auth/:nodeId/:authSecret`
- 节点的 Hysteria2 配置引用该完整 URL
- HTTPS（Caddy 提供）确保 URL 中的 secret 在传输中加密

```
节点 Hysteria2 config.yaml:
  auth:
    type: http
    http:
      url: https://tunpilot.example.com/auth/bwg-us/a1b2c3d4e5f6...

TunPilot 收到请求:
  1. 从 URL 路径提取 nodeId 和 authSecret
  2. 查 nodes 表验证 nodeId 存在 + auth_secret 匹配 + enabled
  3. 验证失败 → 返回 200 {ok: false}（Hysteria2 要求 HTTP 200）
  4. 验证通过 → 继续用户认证逻辑
```

### Auth 回调处理逻辑

```
收到 POST /auth/:nodeId/:authSecret
Body: {addr, auth, tx}

1. 验证节点: nodeId 存在 && auth_secret 匹配 && enabled
   → 失败: 返回 {ok: false}

2. 查找用户: 根据 auth 字段（密码）匹配 users 表
   → 未找到: 返回 {ok: false}

3. 检查用户状态:
   - enabled == 1
   - expires_at 为 NULL 或未过期
   - quota_bytes == 0（无限制）或 used_bytes < quota_bytes
   → 任一不满足: 返回 {ok: false}

4. 检查节点权限: user_nodes 表中存在 (user_id, node_id) 记录
   → 不存在: 返回 {ok: false}

5. 全部通过: 返回 {ok: true, id: user.name}
   → id 使用 user.name，使 Hysteria2 流量统计以用户名为 key
```

### 订阅链接安全

- Token 为随机 UUID（`crypto.randomUUID()`），纯查找 key
- 不需要签名，知道 token 即可访问（同主流机场方案）
- HTTPS 保护传输

## 流量同步

### 机制：定时轮询 + 本地存储

```
┌─────────────┐  每5分钟  ┌─────────────┐
│  TunPilot   │ ------→  │  节点        │
│  定时任务    │  GET      │  /traffic    │
│             │  ?clear=1 │  (Stats API) │
│             │ ←------   │             │
│  写入        │  {user:   │             │
│  traffic_   │   {tx,rx}}│             │
│  logs       │           │             │
│  累加        │           │             │
│  used_bytes │           │             │
└─────────────┘           └─────────────┘
```

1. **定时任务**（`setInterval` 5 分钟）：
   - 遍历所有 enabled 节点
   - `GET /traffic?clear=1`（获取增量并清零节点计数器）
   - 认证：`Authorization: <stats_secret>` header
   - 按用户写入 `traffic_logs` 表
   - 累加到 `users.used_bytes`

2. **Auth 回调时**：检查 `used_bytes` vs `quota_bytes`，超额直接拒绝

3. **`get_traffic_stats` MCP tool**：查询本地 `traffic_logs`，支持按用户/节点/时间范围过滤

### 为什么不实时查询节点

- Auth 回调需要最低延迟（只查本地 SQLite），不能等待跨网络请求
- 5 分钟精度对流量配额管理已经足够
- 节点可能临时不可达，不影响已同步的数据

## max_devices 处理

Hysteria2 `GET /online` 返回 `{username: connection_count}`，connection_count 是设备数（客户端实例数）。

**v1 策略：监控告警，不实时阻断**

- `max_devices` 作为记录字段保留在 users 表
- `check_health` 汇报各用户在线设备数，标记超限用户
- Agent 可根据报告决定是否调用 Hysteria2 `POST /kick` 踢人
- 不在 auth 回调中检查（需要跨节点查询所有 `/online`，延迟不可控）

## 数据模型

```sql
nodes (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,         -- 显示名称，如 "BWG-US"
  host          TEXT NOT NULL,         -- 节点地址（域名或 IP）
  port          INTEGER NOT NULL,      -- Hysteria2 代理端口
  protocol      TEXT NOT NULL,         -- "hysteria2" (未来: "vless", "ss" 等)
  auth_secret   TEXT NOT NULL,         -- 认证回调 URL 中的 secret（32 字符 hex）
  stats_port    INTEGER,               -- 流量统计 API 端口
  stats_secret  TEXT,                  -- 流量统计 API 密钥
  sni           TEXT,                  -- TLS SNI（订阅生成用）
  cert_path     TEXT,                  -- 证书路径（信息记录，Agent 运维用）
  cert_expires  TEXT,                  -- 证书到期时间
  hy2_version   TEXT,                  -- Hysteria2 版本
  config_path   TEXT,                  -- 配置文件路径（信息记录）
  ssh_user      TEXT,                  -- SSH 用户名（Agent 运维用）
  ssh_port      INTEGER DEFAULT 22,    -- SSH 端口
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
  user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
  node_id       TEXT REFERENCES nodes(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, node_id)
)

subscriptions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
  token         TEXT NOT NULL UNIQUE,  -- 随机 UUID，订阅链接中的 token
  format        TEXT NOT NULL,         -- "shadowrocket", "singbox", "clash"
  created_at    TEXT DEFAULT (datetime('now'))
)

traffic_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT REFERENCES users(id),
  node_id       TEXT REFERENCES nodes(id),
  tx_bytes      INTEGER DEFAULT 0,     -- 上行（节点视角的发送）
  rx_bytes      INTEGER DEFAULT 0,     -- 下行（节点视角的接收）
  recorded_at   TEXT DEFAULT (datetime('now'))
)
```

与初版的差异：
- `nodes` 新增 `auth_secret`（认证回调安全）、`sni`（订阅生成）、`ssh_port`
- `user_nodes` 和 `subscriptions` 增加 `ON DELETE CASCADE`
- `traffic_logs` 补充 tx/rx 语义注释

## 订阅生成

订阅链接格式：`https://tunpilot.example.com/sub/:token`

客户端 GET 该 URL 后，TunPilot 根据 token 查找用户，获取其可访问的 enabled 节点列表，渲染出完整的客户端配置。

不做 User-Agent 自动检测，完全依赖 `subscriptions.format` 字段。

三种格式的详细模板见 [协议细节文档](./2026-03-01-tunpilot-protocols.md)。

### 分流规则

从现有 Gist 模板迁移，以 JSON 文件存储在项目中（`config/routing-rules.json`）。三种订阅格式共享同一套规则数据源，渲染时分别转换为对应格式。

## 配置

通过环境变量配置，`src/config.ts` 提供类型安全的默认值：

```
TUNPILOT_PORT=3000            # HTTP + MCP 共用端口
TUNPILOT_HOST=0.0.0.0         # 监听地址
TUNPILOT_DB_PATH=./data/tunpilot.db
TUNPILOT_BASE_URL=https://tunpilot.example.com  # 对外 URL（生成订阅链接用）
MCP_AUTH_TOKEN=                # MCP 访问令牌（必填）
TRAFFIC_SYNC_INTERVAL=300000  # 流量同步间隔，毫秒，默认 5 分钟
```

## 部署

- 部署在 VPS 上，单进程 Bun.js 服务
- Caddy 反向代理：自动 HTTPS + 证书管理
- MCP 和 HTTP 共用一个 Hono server，一个端口
- 数据库文件持久化在 `./data/` 目录

### Caddy 配置示例

```
tunpilot.example.com {
    reverse_proxy localhost:3000
}
```

### 数据库初始化

启动时自动执行 `CREATE TABLE IF NOT EXISTS`。v1 不引入迁移工具，后续 schema 变更再考虑。

## Skill 层（客户端侧，后续编写）

| Skill | 流程 |
|-------|------|
| `onboard-user` | create_user → 分配节点 → generate_subscription → 发送链接 |
| `node-health-check` | check_health → get_traffic_stats → get_cert_status → 汇总报告 |
| `deploy-node` | get_deploy_template → Agent SSH 部署 → add_node 录入 → 更新节点 auth URL → check_health 验证 |
| `renew-cert` | get_cert_status → Agent SSH 更换证书 → 重启服务 → update_node 更新证书信息 → 验证 |
