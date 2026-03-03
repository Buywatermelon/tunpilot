# 节点网络质量诊断工具集成方案

> 日期：2026-03-03  
> 状态：方案设计

## 背景

TunPilot 当前已集成 [xykt/IPQuality](https://github.com/xykt/IPQuality) 进行 IP 质量检测（风险评分、流媒体解锁、邮件黑名单）。但对于代理节点而言，**网络质量**同样关键——延迟、带宽、回程线路等直接影响用户体验。

本方案调研并推荐适合集成到 TunPilot 的网络质量检测工具。

## 现有实现

| 文件 | 工具 | MCP Tool |
|------|------|----------|
| `src/services/ipquality.ts` | xykt/IPQuality | `test_node_ipquality` |

集成方式：SSH 到节点 → 运行脚本 `-j` 参数 → 获取 JSON → 解析返回。

## 推荐工具

### 优先级 1：xykt/NetQuality ⭐⭐⭐

- **仓库**：https://github.com/xykt/NetQuality (4.4k⭐)
- **作者**：与 IPQuality 同一作者（xykt），天然配对
- **功能模块**（7 大模块）：
  1. BGP 信息（ASN、上游接入等）
  2. 本地策略
  3. 接入信息 
  4. 三网 TCP 大包延迟（31 省/市/自治区，电信/联通/移动）
  5. 三网回程路由
  6. 国内测速（基于 Speedtest.net，含大湾区）
  7. 国际互连（全球五大洲网速及延迟）
- **JSON 输出**：`bash <(curl -Ls Net.Check.Place) -j`
- **其他参数**：
  - `-4` / `-6`：IPv4/IPv6 单栈
  - `-P`：延迟模式（轻量级，跳过测速）
  - `-R [省份]`：完整路由模式
  - `-L`：低数据模式
  - `-S 1234567`：跳过指定章节
  - `-n`：跳过 OS 检测和依赖安装
  - `-y`：自动安装依赖

#### 集成方案

```typescript
// 新建 src/services/netquality.ts
// MCP Tool: test_node_netquality

// 运行命令（通过 SSH）
const command = "bash <(curl -sL Net.Check.Place) -j -4 -y";

// 延迟模式（更快，~30s）
const commandPingOnly = "bash <(curl -sL Net.Check.Place) -j -4 -y -P";

// 低数据模式
const commandLowData = "bash <(curl -sL Net.Check.Place) -j -4 -y -L";
```

**预估执行时长**：完整模式 3-5 分钟，延迟模式 ~30 秒  
**集成难度**：低（与 IPQuality 完全相同的集成模式）

---

### 优先级 2：oneclickvirt/backtrace ⭐⭐

- **仓库**：https://github.com/oneclickvirt/backtrace (240⭐)
- **原版**：https://github.com/zhanghanyun/backtrace (1.4k⭐)
- **功能**：
  - 三网回程线路类型判断
  - 支持线路：CN2 GIA / CN2 GT / AS9929 / AS4837 / AS4134(163) / CMIN2 / CMI / CTGNET
  - 多次并发路由检测取平均，避免单次网络波动
  - IPv4 + IPv6 支持
  - 全平台二进制（无依赖）
- **特点**：Go 编写，独立二进制，无系统依赖，执行快（~10s）

#### 集成方案

```typescript
// 新建 src/services/backtrace.ts
// MCP Tool: test_node_backtrace

// 安装 + 运行（通过 SSH）
const installCmd = "curl https://raw.githubusercontent.com/oneclickvirt/backtrace/main/backtrace_install.sh -sSf | bash";
const runCmd = "backtrace";

// 或直接下载对应架构二进制运行
```

**预估执行时长**：~10 秒  
**集成难度**：低-中（输出为文本格式，需自行解析，无 JSON 模式）  
**价值**：快速判断线路品质（CN2 GIA vs 普通163），对选购/评估节点非常有用

---

### 优先级 3：nxtrace/NTrace-core ⭐

- **仓库**：https://github.com/nxtrace/NTrace-core (7.6k⭐)
- **功能**：
  - 可视化路由追踪（ICMP/TCP/UDP）
  - MTR 持续探测模式
  - 快速回程测试：`nexttrace --fast-trace`
  - 丰富的 GeoIP 数据（LeoMoeAPI）
  - Route-Path ASN 路径图
  - JSON / Raw / Table 等多种输出格式
  - Globalping 远程探测支持
- **JSON 输出**：`nexttrace --json 目标IP` 或 `nexttrace -r --raw 目标IP`

#### 集成方案

```typescript
// 新建 src/services/traceroute.ts
// MCP Tool: test_node_traceroute

// 安装
const installCmd = "curl -sL nxtrace.org/nt | bash";

// 快速三网回程
const fastTraceCmd = "nexttrace --fast-trace --json";

// 指定目标路由追踪
const traceCmd = "nexttrace --json --max-hops 30 目标IP";

// MTR 报告模式（N次探测后输出汇总）
const mtrCmd = "nexttrace -r --raw 目标IP";
```

**预估执行时长**：快速回程 ~60s，单目标追踪 ~15s  
**集成难度**：中（需安装二进制，输出格式需适配）  
**价值**：深度路由诊断，精确定位网络瓶颈

---

### 参考但不推荐直接集成

| 工具 | 理由 |
|------|------|
| [spiritLHLS/ecs](https://github.com/spiritLHLS/ecs) (6.4k⭐) 融合怪 | 综合测评脚本，输出文本为主，非结构化，适合人工查看不适合自动化 |
| [LemonBench](https://github.com/LemonBench/LemonBench) (540⭐) | 同上，文本输出为主，2年未更新 |
| [i-abc/Speedtest](https://github.com/i-abc/Speedtest) (827⭐) | 已归档，交互式脚本 |

## 实施计划

### Phase 1：NetQuality 集成
1. 新建 `src/services/netquality.ts`（SSH 运行 + JSON 解析）
2. 定义 `NetQualityResult` 类型
3. 在 `src/mcp/tools/diagnostics.ts` 注册 `test_node_netquality` Tool
4. 提供模式选择：完整 / 延迟 / 低数据
5. 编写测试

### Phase 2：Backtrace 集成
1. 新建 `src/services/backtrace.ts`
2. 解析 backtrace 文本输出为结构化数据
3. 注册 `test_node_backtrace` Tool
4. 编写测试

### Phase 3：NextTrace 集成（可选）
1. 新建 `src/services/traceroute.ts`
2. 解析 NextTrace JSON 输出
3. 注册 `test_node_traceroute` Tool
4. 编写测试

## 设计原则

- **统一集成模式**：与现有 IPQuality 保持一致——SSH 到节点运行脚本、解析输出
- **MCP Tool 命名**：`test_node_*` 前缀
- **超时控制**：NetQuality 完整模式 5 分钟，其他 2 分钟
- **错误处理**：SSH 连接失败、脚本超时、输出解析失败
- **节点要求**：需配置 `ssh_user`，与 IPQuality 相同
