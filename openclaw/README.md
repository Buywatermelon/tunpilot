# TunPilot OpenClaw Plugin

[TunPilot](https://github.com/Buywatermelon/tunpilot) 的 OpenClaw 插件。一键安装即可获得 MCP 连接配置、Skill 和 Gateway UI 集成。

## 安装

```bash
openclaw plugins install @tunpilot/openclaw-plugin
```

也可以单独安装 Skill（不需要完整插件）：

```bash
clawhub install deploying-nodes
```

## 配置

安装后在 OpenClaw 设置界面填写：

| 字段 | 说明 |
|------|------|
| **TunPilot URL** | TunPilot 服务地址，如 `https://tunpilot.example.com` |
| **MCP Auth Token** | MCP 认证令牌 |

插件会自动向 Gateway 注册 MCP 连接，无需手动编辑配置文件。

## 功能

### MCP 集成

插件启动时自动注册 TunPilot MCP 服务到 OpenClaw Gateway，提供 16 个工具：

- **节点**: `list_nodes`, `get_node_info`, `add_node`, `update_node`, `remove_node`
- **用户**: `list_users`, `create_user`, `update_user`, `delete_user`, `reset_traffic`
- **订阅**: `generate_subscription`, `list_subscriptions`, `get_subscription_config`
- **监控**: `check_health`, `get_traffic_stats`, `get_cert_status`

### Skill

| Skill | 说明 |
|-------|------|
| `deploying-nodes` | Hysteria2 节点部署指南，包含配置模板和分步操作流程 |

Skill 需要的环境依赖：
- 环境变量：`TUNPILOT_URL`, `TUNPILOT_MCP_TOKEN`
- 工具：`ssh`

## 开发

```bash
# 构建
bun run build

# 监听模式
bun run dev
```
