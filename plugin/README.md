# TunPilot Claude Code Plugin

[TunPilot](https://github.com/Buywatermelon/tunpilot) 的 Claude Code 插件。安装即获得全套 Skill，让 Agent 引导你完成从部署到管理的所有操作。

## 安装

```
/plugin marketplace add https://github.com/Buywatermelon/tunpilot.git
```

```
/plugin install tunpilot@Buywatermelon-tunpilot
```

安装后重启 Claude Code 以加载插件。

## 从零开始

安装插件后，用自然语言驱动 Agent 完成一切：

```
> 帮我部署 TunPilot 并连接           ← getting-started skill（部署 + 连接一气呵成）
> 部署一个新的 Hysteria2 节点         ← deploying-nodes skill
```

每一步都由对应的 Skill 引导 Agent 自动完成。

## Skill 列表

| Skill | 触发场景 | 作用 |
|-------|---------|------|
| `getting-started` | 部署 TunPilot 服务 / 连接 MCP / 首次配置 | 引导一键部署 + MCP 连接 |
| `deploying-nodes` | 部署 Hysteria2 代理节点 | 提供配置模板和分步操作流程 |

## MCP 连接后

连接成功后可使用 16 个 MCP 工具，直接用自然语言操作：

```
> 帮我添加一个新节点，host 是 us1.example.com，端口 443
> 列出所有用户的流量使用情况
> 给用户 alice 生成一个 Shadowrocket 订阅链接
> 检查所有节点的证书到期状态
```

### 工具清单

- **节点**: `list_nodes`, `get_node_info`, `add_node`, `update_node`, `remove_node`
- **用户**: `list_users`, `create_user`, `update_user`, `delete_user`, `reset_traffic`
- **订阅**: `generate_subscription`, `list_subscriptions`, `get_subscription_config`
- **监控**: `check_health`, `get_traffic_stats`, `get_cert_status`
