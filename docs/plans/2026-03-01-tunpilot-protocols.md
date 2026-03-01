# TunPilot — 协议细节与订阅格式

本文档是 [主设计文档](./2026-03-01-tunpilot-design.md) 的补充，记录 Hysteria2 协议交互的精确格式和订阅配置生成模板。

## Hysteria2 Auth 回调协议

参考：[Full Server Config](https://v2.hysteria.network/docs/advanced/Full-Server-Config/)

### 节点侧配置

每个节点的 Hysteria2 `config.yaml` 中配置 HTTP 认证：

```yaml
auth:
  type: http
  http:
    url: https://tunpilot.example.com/auth/<nodeId>/<authSecret>
    insecure: false
```

### 请求格式（节点 → TunPilot）

```
POST /auth/:nodeId/:authSecret
Content-Type: application/json

{
  "addr": "123.123.123.123:44556",   // 客户端 IP:端口
  "auth": "user_password_here",       // 客户端认证密码
  "tx":   123456                      // 客户端下载速率（字节/秒，节点视角的发送速率）
}
```

### 响应格式（TunPilot → 节点）

**必须返回 HTTP 200**，无论认证成功或失败。其他状态码会被 Hysteria2 视为认证失败。

成功：
```json
{
  "ok": true,
  "id": "username"
}
```

失败：
```json
{
  "ok": false,
  "id": ""
}
```

`id` 字段的值会被 Hysteria2 用作流量统计和日志中的用户标识。TunPilot 使用 `user.name` 作为 `id`，确保流量统计 API 返回的 key 与 TunPilot 用户名一致。

## Hysteria2 流量统计 API

参考：[Traffic Stats API](https://v2.hysteria.network/docs/advanced/Traffic-Stats-API/)

### 节点侧配置

```yaml
trafficStats:
  listen: :9999        # 统计 API 监听端口
  secret: some_secret  # API 认证密钥
```

### 认证方式

所有请求携带 `Authorization` header，值为配置中的 `secret`：

```
Authorization: some_secret
```

### GET /traffic — 流量统计

获取各用户的累计流量。

```
GET http://<node_host>:<stats_port>/traffic
Authorization: <stats_secret>
```

响应：
```json
{
  "wang": { "tx": 514, "rx": 4017 },
  "joe":  { "tx": 7790, "rx": 446623 }
}
```

- `tx`: 上行字节数（节点发送，即用户下载）
- `rx`: 下行字节数（节点接收，即用户上传）

加 `?clear=1` 参数在获取后清零计数器（TunPilot 定时同步时使用）：

```
GET http://<node_host>:<stats_port>/traffic?clear=1
```

### GET /online — 在线用户

```
GET http://<node_host>:<stats_port>/online
Authorization: <stats_secret>
```

响应：
```json
{
  "wang": 2,
  "joe": 1
}
```

值为设备数（客户端实例数），不是代理连接数。用于 `check_health` 汇报在线状态和 `max_devices` 监控。

### POST /kick — 踢出用户

```
POST http://<node_host>:<stats_port>/kick
Authorization: <stats_secret>
Content-Type: application/json

["wang", "joe"]
```

注意：客户端有自动重连逻辑，踢出后需要同时在 TunPilot 禁用用户才能彻底阻断。

## 订阅生成格式

### Hysteria2 URI 格式（基础）

参考：[URI Scheme](https://v2.hysteria.network/docs/developers/URI-Scheme/)

```
hysteria2://[auth@]hostname[:port]/?[key=value]&[key=value]...#remarks
```

支持的 query 参数：

| 参数 | 说明 |
|------|------|
| `sni` | TLS Server Name Indication |
| `insecure` | 跳过证书验证，`1` 或 `0` |
| `obfs` | 混淆类型，目前只支持 `salamander` |
| `obfs-password` | 混淆密码 |
| `pinSHA256` | 证书指纹 |

示例：
```
hysteria2://mypassword@us-node.example.com:443/?sni=us-node.example.com&insecure=0#BWG-US
```

### Shadowrocket 格式

返回 `hysteria2://` URI 列表，每行一个节点，整体 base64 编码。

Content-Type: `text/plain; charset=utf-8`

编码前内容示例：
```
hysteria2://password@us-node.example.com:443/?sni=us-node.example.com&insecure=0#BWG-US
hysteria2://password@jp-node.example.com:443/?sni=jp-node.example.com&insecure=0#IIJ-JP
```

编码后即为响应 body。Shadowrocket 自动识别并解析。

### sing-box 格式

返回完整 JSON 配置文件。

Content-Type: `application/json`

```json
{
  "log": {
    "level": "info"
  },
  "dns": {
    "servers": [
      { "tag": "google", "address": "https://dns.google/dns-query" },
      { "tag": "local", "address": "223.5.5.5", "detour": "direct" }
    ],
    "rules": [
      { "geosite": "cn", "server": "local" }
    ]
  },
  "inbounds": [
    {
      "type": "tun",
      "tag": "tun-in",
      "inet4_address": "172.19.0.1/30",
      "auto_route": true,
      "strict_route": true,
      "stack": "system"
    }
  ],
  "outbounds": [
    {
      "type": "selector",
      "tag": "proxy",
      "outbounds": ["BWG-US", "IIJ-JP", "auto", "direct"],
      "default": "auto"
    },
    {
      "type": "urltest",
      "tag": "auto",
      "outbounds": ["BWG-US", "IIJ-JP"],
      "interval": "5m"
    },
    {
      "type": "hysteria2",
      "tag": "BWG-US",
      "server": "us-node.example.com",
      "server_port": 443,
      "password": "user_password",
      "tls": {
        "enabled": true,
        "server_name": "us-node.example.com"
      }
    },
    {
      "type": "hysteria2",
      "tag": "IIJ-JP",
      "server": "jp-node.example.com",
      "server_port": 443,
      "password": "user_password",
      "tls": {
        "enabled": true,
        "server_name": "jp-node.example.com"
      }
    },
    { "type": "direct", "tag": "direct" },
    { "type": "block", "tag": "block" },
    { "type": "dns", "tag": "dns-out" }
  ],
  "route": {
    "rules": [
      { "protocol": "dns", "outbound": "dns-out" },
      { "geosite": "cn", "geoip": "cn", "outbound": "direct" },
      { "geosite": "category-ads-all", "outbound": "block" }
    ],
    "auto_detect_interface": true
  }
}
```

### Clash / mihomo 格式

返回完整 YAML 配置文件。

Content-Type: `text/yaml; charset=utf-8`

```yaml
mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: true

dns:
  enable: true
  enhanced-mode: fake-ip
  nameserver:
    - https://dns.google/dns-query
  fallback:
    - https://1.1.1.1/dns-query
  fallback-filter:
    geoip: true
    geoip-code: CN

proxies:
  - name: "BWG-US"
    type: hysteria2
    server: us-node.example.com
    port: 443
    password: "user_password"
    sni: us-node.example.com

  - name: "IIJ-JP"
    type: hysteria2
    server: jp-node.example.com
    port: 443
    password: "user_password"
    sni: jp-node.example.com

proxy-groups:
  - name: Proxy
    type: select
    proxies:
      - Auto
      - BWG-US
      - IIJ-JP
      - DIRECT

  - name: Auto
    type: url-test
    proxies:
      - BWG-US
      - IIJ-JP
    url: http://www.gstatic.com/generate_204
    interval: 300

rules:
  - GEOSITE,category-ads-all,REJECT
  - GEOIP,CN,DIRECT
  - GEOSITE,CN,DIRECT
  - MATCH,Proxy
```

### 动态内容说明

以上模板中，以下字段在生成时动态填充：

| 字段 | 来源 |
|------|------|
| 节点列表 | `user_nodes` + `nodes` 表（仅 enabled 节点） |
| `password` | `users.password` |
| `server` | `nodes.host` |
| `server_port` / `port` | `nodes.port` |
| `server_name` / `sni` | `nodes.sni`（为空则使用 `nodes.host`） |
| `tag` / `name` / `#remarks` | `nodes.name` |

分流规则部分从 `config/routing-rules.json` 读取，每种格式有自己的渲染逻辑。

## Hysteria2 服务端配置模板

`get_deploy_template` 返回的配置模板，Agent 部署时使用：

```yaml
listen: :443

tls:
  cert: /etc/hysteria/cert.pem
  key: /etc/hysteria/key.pem

auth:
  type: http
  http:
    url: https://tunpilot.example.com/auth/<nodeId>/<authSecret>
    insecure: false

trafficStats:
  listen: :9999
  secret: <stats_secret>

masquerade:
  type: proxy
  proxy:
    url: https://www.bing.com
    rewriteHost: true
```

模板中的占位符（`<nodeId>`、`<authSecret>`、`<stats_secret>`）在 `add_node` 返回时一并提供，Agent 替换后写入节点。
