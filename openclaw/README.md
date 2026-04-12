# TunPilot OpenClaw Plugin

[TunPilot](https://github.com/Buywatermelon/tunpilot) 的 OpenClaw 插件，分发 Skill 并把 TunPilot 地址与认证令牌注入到 Skill 环境。

## 安装

```bash
openclaw plugins install @tunpilot/openclaw-plugin
```

也可以单独安装 Skill（不需要完整插件）：

```bash
clawhub install deploying-hy2-nodes
```

## 配置

安装后在 OpenClaw 设置界面填写：

| 字段 | 说明 |
|------|------|
| **TunPilot URL** | TunPilot 服务地址，如 `https://tunpilot.example.com` |
| **Auth Token** | REST API / CLI 使用的 Bearer Token |

插件启动时会把这两项以 `TUNPILOT_URL` 和 `TUNPILOT_AUTH_TOKEN` 环境变量注入到 Skill 运行上下文，Skill 内部的 `tunpilot` CLI 会据此调用 REST API。

## Skill

| Skill | 说明 |
|-------|------|
| `getting-started` | 部署 TunPilot 服务 + 本地 CLI 连接指引 |
| `deploying-hy2-nodes` | Hysteria2 节点部署指南，包含配置模板和分步操作流程 |
| `deploying-xray-nodes` | Xray/Trojan 节点部署指南，包含配置模板和分步操作流程 |
| `testing-nodes` | 直连服务器执行 IPQuality 和 NetQuality 诊断，输出节点健康报告 |

Skill 运行时依赖：

- 工具：`ssh`、`bun`（用于 `tunpilot` CLI）
- 环境变量：`TUNPILOT_URL`、`TUNPILOT_AUTH_TOKEN`（本插件自动注入）

## 开发

```bash
# 构建
bun run build

# 监听模式
bun run dev
```
