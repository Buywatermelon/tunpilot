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
> 帮我部署 TunPilot                    ← getting-started skill（部署 + CLI 配置一气呵成）
> 部署一个新的 Hysteria2 节点           ← deploying-hy2-nodes skill
> 部署一个新的 Xray/Trojan 节点         ← deploying-xray-nodes skill
```

每一步都由对应的 Skill 引导 Agent 自动完成。

## Skill 列表

| Skill | 触发场景 | 作用 |
|-------|---------|------|
| `getting-started` | 部署 TunPilot 服务 / 首次配置 CLI | 引导一键部署 + 本地 CLI 连接 |
| `deploying-hy2-nodes` | 部署 Hysteria2 代理节点 | 提供配置模板和分步操作流程 |
| `deploying-xray-nodes` | 部署 Xray/Trojan 代理节点 | 提供配置模板和分步操作流程 |
| `testing-nodes` | 质量检测 / 网络测速 / IP 风险扫描 | 直连服务器执行 IPQuality 和 NetQuality 诊断，输出节点健康报告 |

## 部署后

TunPilot 提供三种等价的操作入口，Agent 会优先使用 CLI：

- **Web Admin** — `http://<server>:3000`，浏览器登录后可视化管理
- **CLI** — `tunpilot node/user/sub/health/traffic/setting <action>`
- **REST API** — `/api/v1/*`，Bearer Token 认证

```
> 帮我添加一个新节点，host 是 us1.example.com，端口 443
> 列出所有用户的流量使用情况
> 给用户 alice 生成一个 Shadowrocket 订阅链接
> 检查所有节点的健康状态
```

Agent 会把上面自然语言请求翻译为对应的 `tunpilot` CLI 调用。详见各 Skill 文档中的命令清单。
