# Surge 订阅支持 + Format Registry 重构

## 目标

1. 引入 Format Registry 架构，消除 subscription 代码中的 switch/case 硬编码
2. 添加 Surge 完整托管配置（`#!MANAGED-CONFIG`）订阅格式
3. 各格式迁移为独立模块文件

## 架构设计

### 统一接口

```typescript
interface SubscriptionFormat {
  name: string;
  contentType: string;
  render(user: User, nodes: Node[], meta?: RenderMeta): string;
}

interface RenderMeta {
  subscriptionUrl?: string;  // Surge MANAGED-CONFIG 需要
}
```

### Format Registry

```typescript
const formatRegistry = new Map<string, SubscriptionFormat>();
export function registerFormat(format: SubscriptionFormat): void;
export function getFormat(name: string): SubscriptionFormat | undefined;
export function getAllFormatNames(): string[];
```

### 文件结构

```
src/services/
├── subscription.ts          # CRUD 函数 + 接口定义（瘦身）
├── formats/
│   ├── index.ts             # registry 定义 + 自动注册所有格式
│   ├── shadowrocket.ts      # Base64 URI 列表
│   ├── singbox.ts           # sing-box JSON 配置
│   ├── clash.ts             # Clash YAML 配置
│   └── surge.ts             # Surge 完整托管配置
```

### 消费端改动

- `http/index.ts`: switch → `getFormat(sub.format)?.render()`
- `mcp/tools/subscriptions.ts`: 格式描述从硬编码改为 `getAllFormatNames()`
- `getSubscriptionConfig()`: 用 registry 替代 switch

## Surge 配置格式

```ini
#!MANAGED-CONFIG <url> interval=86400 strict=false

[General]
loglevel = notify
skip-proxy = 127.0.0.1, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10, localhost, *.local

[Proxy]
DIRECT = direct
<name> = hysteria2, <host>, <port>, password=<pwd>[, skip-cert-verify=true][, sni=<sni>]

[Proxy Group]
Proxy = select, Auto, <node1>, <node2>, ..., DIRECT
Auto = url-test, <node1>, <node2>, ..., url=http://www.gstatic.com/generate_204, interval=300, tolerance=50

[Rule]
GEOIP,CN,DIRECT
FINAL,Proxy
```

- `skip-cert-verify=true` 仅在 `node.insecure === 1` 时添加
- `sni` fallback 到 `node.host`
- Content-Type: `text/plain; charset=utf-8`

## 测试策略

- 各格式 render 函数的单元测试迁移到对应文件或保留在统一测试文件
- 新增 `renderSurge` 测试覆盖：正常节点、insecure 节点、sni fallback、MANAGED-CONFIG 头
- Registry 集成测试：注册/查询/列举
- HTTP handler 集成测试：surge 格式的 /sub/:token 端点
