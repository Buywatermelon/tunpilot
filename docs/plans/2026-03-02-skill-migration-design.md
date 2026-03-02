# 纯 Prompt MCP 工具迁移为 Claude Code Skill

## 背景

`src/mcp/tools/ops.ts` 中有 3 个工具，其中 2 个是纯静态文本（`get_deploy_template`、`get_setup_guide`），不涉及数据库或副作用。这类"知识"不适合用 MCP Tool 原语传递，应迁移为 Claude Code Skill，按需注入 context，零延迟、不占 tool 槽位。

## 设计

### Skill 作为 Plugin 分发：`deploying-nodes`

Skill 已从 `.claude/skills/` 迁移到 `plugin/skills/`，作为 Claude Code Plugin 的一部分分发。用户通过 `/plugin install` 一次性获得 MCP server 连接 + Skills。

```
plugin/
├── .claude-plugin/
│   └── plugin.json           # Plugin 元数据
├── .mcp.json                 # MCP server 连接配置
└── skills/
    └── deploying-nodes/
        ├── SKILL.md              # 主入口：概览 + 引导到子文件
        ├── setup-guide.md        # 6 步部署指南（原 get_setup_guide）
        └── hysteria2-template.md # Hy2 配置模板（原 get_deploy_template）
```

**SKILL.md** frontmatter：
- `name: deploying-nodes`
- `description`: 描述触发条件（部署新节点、配置 Hysteria2、运维操作时触发）

**SKILL.md** body：
- 概述 TunPilot 节点部署运维的上下文
- 引导 Claude 按需读取 `setup-guide.md` 或 `hysteria2-template.md`

### MCP 变更

1. **`get_cert_status` 合并到 `monitoring.ts`**
   - 从 `ops.ts` 移动到 `monitoring.ts`，语义更内聚（都是状态查询类）
   - 保持完全相同的接口和实现

2. **删除 `ops.ts`**
   - 全部内容已迁移，文件不再需要

3. **更新 `src/mcp/index.ts`**
   - 移除 `registerOps` 的导入和调用

### 测试变更

**`src/mcp/index.test.ts`：**
- 删除 `get_deploy_template` 和 `get_setup_guide` 的测试用例（不再是 MCP tool）
- `get_cert_status` 测试移到 monitoring describe 块下
- 删除 `ops tools` describe 块

## 变更文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `plugin/.claude-plugin/plugin.json` | Plugin 元数据 |
| 新建 | `plugin/.mcp.json` | MCP server 连接配置 |
| 新建 | `plugin/skills/deploying-nodes/SKILL.md` | Skill 主入口 |
| 新建 | `plugin/skills/deploying-nodes/setup-guide.md` | 部署指南 |
| 新建 | `plugin/skills/deploying-nodes/hysteria2-template.md` | 配置模板 |
| 修改 | `src/mcp/tools/monitoring.ts` | 添加 `get_cert_status` |
| 删除 | `src/mcp/tools/ops.ts` | 全部迁移完毕 |
| 修改 | `src/mcp/index.ts` | 移除 ops 注册 |
| 修改 | `src/mcp/index.test.ts` | 调整测试 |
