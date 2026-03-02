# TunPilot Claude Code Plugin

[TunPilot](https://github.com/Buywatermelon/tunpilot) 的 Claude Code 插件。安装后 Claude Code 可直接调用 TunPilot MCP 工具管理 Hysteria2 代理节点。

## 安装

```bash
claude plugin install tunpilot
```

## 配置 MCP 连接

TunPilot 是自托管服务，每个部署的 URL 不同，需要手动添加 MCP 连接：

```bash
claude mcp add --transport http \
  --header "Authorization: Bearer <your-mcp-token>" \
  --scope user \
  tunpilot https://<your-tunpilot-url>/mcp
```

将 `<your-tunpilot-url>` 和 `<your-mcp-token>` 替换为实际值。添加后可通过 `/mcp` 确认连接状态。

## 使用

安装配置完成后，在 Claude Code 中直接用自然语言操作：

```
> 帮我添加一个新节点，host 是 us1.example.com，端口 443

> 列出所有用户的流量使用情况

> 给用户 alice 生成一个 Shadowrocket 订阅链接

> 部署一个新的 Hysteria2 节点
```

最后一条会触发 `deploying-nodes` Skill，引导完成完整的节点部署流程。

## 包含的 Skill

| Skill | 说明 |
|-------|------|
| `deploying-nodes` | Hysteria2 节点部署指南，包含配置模板和分步操作流程 |

## MCP 工具

插件连接后可使用 16 个 MCP 工具：

- **节点**: `list_nodes`, `get_node_info`, `add_node`, `update_node`, `remove_node`
- **用户**: `list_users`, `create_user`, `update_user`, `delete_user`, `reset_traffic`
- **订阅**: `generate_subscription`, `list_subscriptions`, `get_subscription_config`
- **监控**: `check_health`, `get_traffic_stats`, `get_cert_status`
