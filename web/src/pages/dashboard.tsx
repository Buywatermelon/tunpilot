import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { ArrowUpRight, Users as UsersIcon, Server, Radio, Activity } from "lucide-react"
import { api } from "@/lib/api"
import { formatBytes, formatNumber } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { StatusDot } from "@/components/ui/badge"
import { PageHeader } from "@/components/ui/page-header"
import type { User, Node, Subscription, HealthResponse } from "@/types/api"

type StatusTone = "success" | "warning" | "danger" | "neutral"

function resolveStatus(node: Node, healthStatus?: string): { tone: StatusTone; label: string } {
  if (node.enabled !== 1) return { tone: "neutral", label: "已停用" }
  switch (healthStatus) {
    case "online": return { tone: "success", label: "在线" }
    case "degraded": return { tone: "warning", label: "降级" }
    case "offline": return { tone: "danger", label: "离线" }
    default: return { tone: "success", label: "已启用" }
  }
}

export default function DashboardPage() {
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/users") })
  const nodes = useQuery({ queryKey: ["nodes"], queryFn: () => api.get<Node[]>("/nodes") })
  const subs = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => api.get<Subscription[]>("/subscriptions"),
  })
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get<HealthResponse>("/health"),
    refetchInterval: 30_000,
  })

  const userCount = users.data?.length ?? 0
  const activeUsers = users.data?.filter((u) => u.enabled === 1).length ?? 0
  const nodeCount = nodes.data?.length ?? 0
  const enabledNodes = nodes.data?.filter((n) => n.enabled === 1).length ?? 0
  const subCount = subs.data?.length ?? 0
  const totalTraffic = users.data?.reduce((sum, u) => sum + (u.used_bytes ?? 0), 0) ?? 0

  return (
    <div className="flex flex-col gap-10">
      <PageHeader title="概览" description="你的代理节点、用户与流量的全景视图。" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          icon={<UsersIcon className="h-4 w-4" strokeWidth={1.75} />}
          label="用户"
          value={formatNumber(userCount)}
          hint={userCount === 0 ? "暂无用户" : `${activeUsers} 位活跃`}
          to="/users"
          loading={users.isLoading}
        />
        <Stat
          icon={<Server className="h-4 w-4" strokeWidth={1.75} />}
          label="节点"
          value={formatNumber(nodeCount)}
          hint={nodeCount === 0 ? "暂无节点" : `${enabledNodes} 个已启用`}
          to="/nodes"
          loading={nodes.isLoading}
        />
        <Stat
          icon={<Radio className="h-4 w-4" strokeWidth={1.75} />}
          label="订阅"
          value={formatNumber(subCount)}
          hint={subCount === 0 ? "暂无订阅" : `${subCount} 条已签发`}
          to="/subscriptions"
          loading={subs.isLoading}
        />
        <Stat
          icon={<Activity className="h-4 w-4" strokeWidth={1.75} />}
          label="累计流量"
          value={formatBytes(totalTraffic)}
          hint="全部用户合计"
          loading={users.isLoading}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div>
            <h3 className="font-serif text-[20px] font-medium text-ink leading-none tracking-[-0.005em]">
              节点状态
            </h3>
            <p className="mt-1.5 text-[14px] text-olive">每个边缘节点的实时健康。</p>
          </div>
          <Link
            to="/nodes"
            className="inline-flex items-center gap-1 text-[14px] text-olive hover:text-ink transition-colors"
          >
            管理 <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Link>
        </div>

        <NodeStatusList
          nodes={nodes.data ?? []}
          health={health.data?.nodes ?? []}
          loading={nodes.isLoading}
        />
      </Card>

      <TopUsers users={users.data ?? []} loading={users.isLoading} />
    </div>
  )
}

interface StatProps {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
  to?: string
  loading?: boolean
}

function Stat({ icon, label, value, hint, to, loading }: StatProps) {
  const inner = (
    <Card className="relative h-full p-6 flex flex-col gap-4 hover:shadow-whisper transition-shadow duration-200">
      <div className="flex items-center justify-between text-olive">
        <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em]">
          <span className="text-ink-muted">{icon}</span>
          {label}
        </span>
        {to && (
          <ArrowUpRight
            className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity"
            strokeWidth={1.75}
          />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <span
          data-slot="stat-value"
          className="font-serif text-[32px] font-medium leading-none tracking-[-0.015em] text-ink"
        >
          {loading ? (
            <span className="inline-block h-7 w-16 bg-sand/70 rounded animate-pulse" />
          ) : (
            value
          )}
        </span>
        <span className="text-[14px] text-olive">{hint}</span>
      </div>
    </Card>
  )
  return to ? (
    <Link to={to} className="group block h-full">
      {inner}
    </Link>
  ) : (
    <div className="group h-full">{inner}</div>
  )
}

interface NodeStatusListProps {
  nodes: Node[]
  health: HealthResponse["nodes"]
  loading: boolean
}

function NodeStatusList({ nodes, health, loading }: NodeStatusListProps) {
  if (loading) {
    return (
      <div className="px-6 pb-6 space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 rounded-[10px] bg-sand/40 animate-pulse" />
        ))}
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="border-t border-border-cream px-6 py-12 text-center">
        <p className="font-serif text-[20px] text-ink leading-[1.3]">还没有节点</p>
        <p className="mt-2 text-[14px] text-olive max-w-[360px] mx-auto">
          用{" "}
          <code className="font-mono text-[13px] text-ink-muted bg-sand/70 px-1.5 py-0.5 rounded">
            tunpilot node add
          </code>
          {" "}添加你的第一个 Hysteria2 或 Xray 节点。
        </p>
      </div>
    )
  }

  const byId = new Map(health.map((h) => [h.id, h]))

  return (
    <div className="border-t border-border-cream">
      {nodes.map((node, i) => {
        const h = byId.get(node.id)
        const { tone, label } = resolveStatus(node, h?.status)
        return (
          <div
            key={node.id}
            className={`flex items-center gap-4 px-6 py-3.5 ${i > 0 ? "border-t border-border-cream" : ""}`}
          >
            <StatusDot tone={tone} />
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-medium text-ink truncate">{node.name}</div>
              <div className="text-[13px] text-olive font-mono truncate">
                {node.host}:{node.port}
              </div>
            </div>
            <div className="text-[11px] text-olive uppercase tracking-[0.14em]">
              {node.protocol}
            </div>
            <div className="min-w-[72px] text-right text-[14px] text-olive">{label}</div>
          </div>
        )
      })}
    </div>
  )
}

interface TopUsersProps {
  users: User[]
  loading: boolean
}

function TopUsers({ users, loading }: TopUsersProps) {
  if (loading || users.length === 0) return null

  const ranked = [...users]
    .filter((u) => (u.quota_bytes ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.used_bytes ?? 0) / (b.quota_bytes || 1) -
        (a.used_bytes ?? 0) / (a.quota_bytes || 1),
    )
    .slice(0, 5)

  if (ranked.length === 0) return null

  return (
    <Card>
      <div className="px-6 pt-5 pb-4">
        <h3 className="font-serif text-[20px] font-medium text-ink leading-none tracking-[-0.005em]">
          用量榜
        </h3>
        <p className="mt-1.5 text-[14px] text-olive">配额消耗最高的 5 位用户。</p>
      </div>
      <div className="border-t border-border-cream">
        {ranked.map((u, i) => {
          const pct = Math.min(
            100,
            Math.round(((u.used_bytes ?? 0) / (u.quota_bytes || 1)) * 100),
          )
          const barTone =
            pct >= 90 ? "bg-danger-dot" : pct >= 70 ? "bg-warning-dot" : "bg-terracotta/80"
          return (
            <div
              key={u.id}
              className={`grid grid-cols-[1fr_140px_80px] items-center gap-4 px-6 py-3.5 ${i > 0 ? "border-t border-border-cream" : ""}`}
            >
              <div className="min-w-0">
                <div className="text-[15px] font-medium text-ink truncate">{u.name}</div>
                <div className="text-[13px] text-olive tabular">
                  {formatBytes(u.used_bytes)} / {formatBytes(u.quota_bytes)}
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-sand/80 overflow-hidden">
                <div className={`h-full ${barTone}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="text-right text-[14px] tabular text-ink-muted">{pct}%</div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
