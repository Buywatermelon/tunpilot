import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Trash2, Plus, RefreshCw } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Field } from "@/components/ui/field"
import { Dialog } from "@/components/ui/dialog"
import { Badge, StatusDot } from "@/components/ui/badge"
import { IconButton } from "@/components/ui/icon-button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PageHeader } from "@/components/ui/page-header"
import type { Node, HealthResponse } from "@/types/api"

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

export default function NodesPage() {
  const qc = useQueryClient()
  const [formOpen, setFormOpen] = useState<{ mode: "create" } | { mode: "edit"; node: Node } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Node | null>(null)

  const nodesQuery = useQuery({ queryKey: ["nodes"], queryFn: () => api.get<Node[]>("/nodes") })
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get<HealthResponse>("/health"),
    refetchInterval: 30_000,
  })

  const syncMutation = useMutation({
    mutationFn: () => api.post<{ synced: number }>("/nodes/sync", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nodes"] })
      qc.invalidateQueries({ queryKey: ["health"] })
    },
  })

  const nodes = nodesQuery.data ?? []
  const healthById = new Map((healthQuery.data?.nodes ?? []).map((h) => [h.id, h]))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="节点"
        description="你的 Hysteria2 / Xray 边缘节点及其健康状态。"
        action={
          <>
            <Button
              variant="secondary"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              <RefreshCw
                className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`}
                strokeWidth={1.75}
              />
              同步全部
            </Button>
            <Button onClick={() => setFormOpen({ mode: "create" })}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              添加节点
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        {nodesQuery.isLoading ? (
          <div className="p-6 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-[10px] bg-sand/40 animate-pulse" />
            ))}
          </div>
        ) : nodes.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-serif text-[20px] text-ink leading-[1.3]">还没有节点</p>
            <p className="mt-2 text-[14px] text-olive max-w-[360px] mx-auto">
              添加你的第一个 Hysteria2 或 Xray 节点即可开始签发订阅。
            </p>
            <div className="mt-5 inline-flex">
              <Button onClick={() => setFormOpen({ mode: "create" })}>
                <Plus className="h-4 w-4" strokeWidth={2} />
                添加节点
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="border-b border-border-cream text-[11px] uppercase tracking-[0.14em] text-olive">
                  <th className="text-left font-medium px-6 py-3">节点</th>
                  <th className="text-left font-medium px-4 py-3">协议</th>
                  <th className="text-left font-medium px-4 py-3">地址</th>
                  <th className="text-left font-medium px-4 py-3">健康</th>
                  <th className="text-right font-medium px-6 py-3 w-[110px]">操作</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n, i) => {
                  const h = healthById.get(n.id)
                  const { tone, label } = resolveStatus(n, h?.status)
                  return (
                    <tr
                      key={n.id}
                      className={`group ${i > 0 ? "border-t border-border-cream" : ""} hover:bg-sand/25 transition-colors`}
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-ink">{n.name}</div>
                        <div className="text-[13px] text-olive font-mono truncate max-w-[220px]">
                          {n.id}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge tone="brand">{n.protocol}</Badge>
                      </td>
                      <td className="px-4 py-4 font-mono text-[14px] text-ink-muted">
                        {n.host}:{n.port}
                      </td>
                      <td className="px-4 py-4">
                        <div className="inline-flex items-center gap-2">
                          <StatusDot tone={tone} />
                          <span className="text-[14px] text-olive">{label}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                          <IconButton
                            title="编辑"
                            onClick={() => setFormOpen({ mode: "edit", node: n })}
                          >
                            <Pencil className="h-4 w-4" strokeWidth={1.75} />
                          </IconButton>
                          <IconButton title="删除" danger onClick={() => setDeleteTarget(n)}>
                            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {formOpen && (
        <NodeFormDialog
          key={formOpen.mode === "edit" ? formOpen.node.id : "create"}
          initial={formOpen.mode === "edit" ? formOpen.node : null}
          onClose={() => setFormOpen(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          key={`del-${deleteTarget.id}`}
          onClose={() => setDeleteTarget(null)}
          title="删除节点"
          description={`将永久删除「${deleteTarget.name}」及其所有用户分配。订阅中的该节点会立即失效。`}
          confirmLabel="删除"
          action={() => api.delete(`/nodes/${deleteTarget.id}`)}
          invalidate={["nodes", "health"]}
        />
      )}
    </div>
  )
}

interface NodeFormValues {
  name: string
  host: string
  port: string
  protocol: string
  stats_port: string
  sni: string
  hy2_version: string
  ssh_alias: string
  insecure: boolean
  enabled: boolean
}

function toFormValues(n: Node | null): NodeFormValues {
  const node = n as (Node & Partial<Record<string, unknown>>) | null
  return {
    name: (node?.name as string) ?? "",
    host: (node?.host as string) ?? "",
    port: node?.port != null ? String(node.port) : "443",
    protocol: (node?.protocol as string) ?? "hysteria2",
    stats_port: node?.stats_port != null ? String(node.stats_port) : "",
    sni: (node?.sni as string) ?? "",
    hy2_version: (node?.hy2_version as string) ?? "",
    ssh_alias: (node?.ssh_alias as string) ?? "",
    insecure: (node?.insecure as number) === 1,
    enabled: n ? (n.enabled === 1) : true,
  }
}

function NodeFormDialog({ initial, onClose }: { initial: Node | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [v, setV] = useState<NodeFormValues>(toFormValues(initial))
  const [error, setError] = useState("")

  const isEdit = !!initial
  const set = <K extends keyof NodeFormValues>(key: K, value: NodeFormValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }))

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: v.name.trim(),
        host: v.host.trim(),
        port: parseInt(v.port, 10),
        protocol: v.protocol,
        stats_port: v.stats_port ? parseInt(v.stats_port, 10) : null,
        sni: v.sni || null,
        hy2_version: v.hy2_version || null,
        ssh_alias: v.ssh_alias || null,
        insecure: v.insecure ? 1 : 0,
        enabled: v.enabled ? 1 : 0,
      }
      if (isEdit) {
        return api.patch(`/nodes/${initial!.id}`, payload)
      }
      return api.post("/nodes", payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nodes"] })
      qc.invalidateQueries({ queryKey: ["health"] })
      onClose()
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "保存失败，请重试。")
    },
  })

  const canSubmit =
    v.name.trim().length > 0 &&
    v.host.trim().length > 0 &&
    Number.isFinite(parseInt(v.port, 10)) &&
    !mutation.isPending

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? `编辑节点 · ${initial!.name}` : "添加节点"}
      description={isEdit ? "变更保存后会触发一次同步下发。" : "保存后即可为用户分配该节点。"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending ? "保存中…" : isEdit ? "保存" : "创建"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="名称" htmlFor="n-name">
            <Input
              id="n-name"
              value={v.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="tokyo-jp"
              autoFocus
            />
          </Field>
          <Field label="协议">
            <Select value={v.protocol} onChange={(e) => set("protocol", e.target.value)}>
              <option value="hysteria2">Hysteria2</option>
              <option value="trojan">Trojan</option>
              <option value="xray">Xray</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_120px] gap-4">
          <Field label="主机" htmlFor="n-host">
            <Input
              id="n-host"
              value={v.host}
              onChange={(e) => set("host", e.target.value)}
              placeholder="tokyo.example.com"
            />
          </Field>
          <Field label="端口" htmlFor="n-port">
            <Input
              id="n-port"
              type="number"
              value={v.port}
              onChange={(e) => set("port", e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="SNI" htmlFor="n-sni" hint="TLS SNI / 证书主机名">
            <Input
              id="n-sni"
              value={v.sni}
              onChange={(e) => set("sni", e.target.value)}
              placeholder="tokyo.example.com"
            />
          </Field>
          <Field label="Stats 端口" htmlFor="n-stats" hint="健康检查端点，留空跳过">
            <Input
              id="n-stats"
              type="number"
              value={v.stats_port}
              onChange={(e) => set("stats_port", e.target.value)}
              placeholder="8080"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="HY2 版本" htmlFor="n-hy2" hint="仅 Hysteria2 需要">
            <Input
              id="n-hy2"
              value={v.hy2_version}
              onChange={(e) => set("hy2_version", e.target.value)}
              placeholder="2.6.2"
            />
          </Field>
          <Field label="SSH Alias" htmlFor="n-ssh" hint="用于远程下发配置">
            <Input
              id="n-ssh"
              value={v.ssh_alias}
              onChange={(e) => set("ssh_alias", e.target.value)}
              placeholder="tokyo"
            />
          </Field>
        </div>
        <div className="flex items-center gap-6 pt-1">
          <CheckboxRow
            label="允许自签证书 (insecure)"
            checked={v.insecure}
            onChange={(c) => set("insecure", c)}
          />
          <CheckboxRow
            label="启用"
            checked={v.enabled}
            onChange={(c) => set("enabled", c)}
          />
        </div>
        {error && <p className="text-[13px] text-error">{error}</p>}
      </div>
    </Dialog>
  )
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (c: boolean) => void
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-[18px] w-[18px] rounded border-border-warm accent-terracotta cursor-pointer"
      />
      <span className="text-[14px] text-ink-muted">{label}</span>
    </label>
  )
}
