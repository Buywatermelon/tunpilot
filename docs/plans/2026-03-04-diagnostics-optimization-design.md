# Diagnostics Optimization Design

## Problem

Agent 通过 SSH 执行 IPQuality/NetQuality 第三方脚本时存在两个核心问题：

1. **输出噪声**：脚本为人类终端设计（ANSI 色码、赞助商广告、进度条动画），产生 ~50KB 无用输出，Agent 需要多轮工具调用清理后才能提取 JSON
2. **执行阻塞**：IPQuality ~90s + NetQuality ~5min，Agent 被阻塞，用户干等

## Solution: A+C

### Part A: 节点包装脚本 `tunpilot-diag`

部署在每个节点的 `/usr/local/bin/tunpilot-diag`，一次执行 IPQuality + NetQuality full，只输出干净 JSON。

**接口**：`tunpilot-diag` (无参数，执行全部诊断)

**输出格式** (stdout, 两行 JSON)：
```
{"type":"ipquality","data":{...}}
{"type":"netquality","data":{...}}
```

如果某项失败：
```
{"type":"ipquality","error":"no JSON found in output","exit_code":1}
```

**核心逻辑**：
1. `TERM=dumb` 抑制颜色
2. 顺序执行 IPQuality → NetQuality（避免网络测试互相干扰）
3. 捕获原始输出到临时文件，用 awk 提取平衡括号 JSON
4. stdout 只输出 JSON lines，stderr 输出进度信息
5. 退出时清理临时文件

### Part C: 更新 testing-nodes Skill

1. 命令简化：`ssh node "tunpilot-diag"` 替代原始脚本调用
2. 后台执行：`run_in_background` 启动 SSH，不同节点并行
3. 前置检查：验证 `tunpilot-diag` 是否安装，未安装则自动推送
4. Fallback：保留原始命令 + 管道清理的降级路径

## Files Changed

| File | Change |
|------|--------|
| `scripts/tunpilot-diag.sh` | New — wrapper script |
| `skills/testing-nodes/SKILL.md` | Update — use tunpilot-diag, background execution |
| `skills/deploying-nodes/SKILL.md` | Update — add tunpilot-diag deployment step |
