import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Trash2, RotateCcw, Plus } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { formatBytes, formatDate } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Field } from "@/components/ui/field"
import { Dialog } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { IconButton } from "@/components/ui/icon-button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PageHeader } from "@/components/ui/page-header"
import type { User, Node } from "@/types/api"

const GB = 1024 * 1024 * 1024

const bytesToGb = (b: number) => Math.round((b / GB) * 10) / 10
const toIsoDate = (raw: string | null | undefined) => (raw ? raw.slice(0, 10) : "")

function usageTone(pct: number): "success" | "warning" | "danger" {
  if (pct >= 90) return "danger"
  if (pct >= 70) return "warning"
  return "success"
}

export default function UsersPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [resetTarget, setResetTarget] = useState<User | null>(null)

  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/users") })
  const nodesQuery = useQuery({ queryKey: ["nodes"], queryFn: () => api.get<Node[]>("/nodes") })

  const users = usersQuery.data ?? []
  const nodes = nodesQuery.data ?? []

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="用户"
        description="管理账号、流量配额和设备上限。"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            新建用户
          </Button>
        }
      />

      <Card className="overflow-hidden">
        {usersQuery.isLoading ? (
          <TableSkeleton />
        ) : users.length === 0 ? (
          <EmptyState onCreate={() => setCreateOpen(true)} />
        ) : (
          <UsersTable
            users={users}
            onEdit={setEditTarget}
            onDelete={setDeleteTarget}
            onReset={setResetTarget}
          />
        )}
      </Card>

      {createOpen && (
        <CreateUserDialog
          onClose={() => setCreateOpen(false)}
          nodes={nodes}
        />
      )}
      {editTarget && (
        <EditUserDialog
          key={editTarget.id}
          user={editTarget}
          onClose={() => setEditTarget(null)}
          nodes={nodes}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          key={`del-${deleteTarget.id}`}
          onClose={() => setDeleteTarget(null)}
          title="删除用户"
          description={`将永久删除「${deleteTarget.name}」，同时撤销其所有节点分配和订阅。此操作不可撤销。`}
          confirmLabel="删除"
          action={() => api.delete(`/users/${deleteTarget.id}`)}
          invalidate={["users", "subscriptions"]}
        />
      )}
      {resetTarget && (
        <ConfirmDialog
          key={`reset-${resetTarget.id}`}
          onClose={() => setResetTarget(null)}
          title="重置流量"
          description={`将「${resetTarget.name}」的已用流量清零。配额保持不变。`}
          confirmLabel="重置"
          tone="primary"
          action={() => api.post(`/users/${resetTarget.id}/reset-traffic`, {})}
          invalidate={["users"]}
        />
      )}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="p-6 space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 rounded-[10px] bg-sand/40 animate-pulse" />
      ))}
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="font-serif text-[20px] text-ink leading-[1.3]">还没有用户</p>
      <p className="mt-2 text-[14px] text-olive max-w-[360px] mx-auto">
        新建用户后可为其分配节点、签发订阅，并追踪流量用量。
      </p>
      <div className="mt-5 inline-flex">
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          新建用户
        </Button>
      </div>
    </div>
  )
}

interface UsersTableProps {
  users: User[]
  onEdit: (u: User) => void
  onDelete: (u: User) => void
  onReset: (u: User) => void
}

function UsersTable({ users, onEdit, onDelete, onReset }: UsersTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[15px]">
        <thead>
          <tr className="border-b border-border-cream text-[11px] uppercase tracking-[0.14em] text-olive">
            <th className="text-left font-medium px-6 py-3">用户</th>
            <th className="text-left font-medium px-4 py-3">状态</th>
            <th className="text-left font-medium px-4 py-3 min-w-[240px]">流量用量</th>
            <th className="text-right font-medium px-4 py-3">设备</th>
            <th className="text-left font-medium px-4 py-3">到期</th>
            <th className="text-right font-medium px-6 py-3 w-[130px]">操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u, i) => {
            const quota = u.quota_bytes ?? 0
            const used = u.used_bytes ?? 0
            const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0
            const tone = usageTone(pct)
            const expired = u.expires_at
              ? new Date(u.expires_at.replace(" ", "T")) < new Date()
              : false
            return (
              <tr
                key={u.id}
                className={`group ${i > 0 ? "border-t border-border-cream" : ""} hover:bg-sand/25 transition-colors`}
              >
                <td className="px-6 py-4">
                  <div className="font-medium text-ink">{u.name}</div>
                  <div className="text-[13px] text-olive font-mono truncate max-w-[220px]">
                    {u.id}
                  </div>
                </td>
                <td className="px-4 py-4">
                  {u.enabled === 1 ? (
                    <Badge tone="success">启用</Badge>
                  ) : (
                    <Badge tone="neutral">停用</Badge>
                  )}
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col gap-1.5 max-w-[280px]">
                    <div className="text-[13px] text-olive tabular">
                      {formatBytes(used)} / {quota > 0 ? formatBytes(quota) : "无限制"}
                    </div>
                    {quota > 0 && (
                      <div className="h-1.5 rounded-full bg-sand/80 overflow-hidden">
                        <div
                          className={
                            tone === "danger"
                              ? "h-full bg-danger-dot"
                              : tone === "warning"
                                ? "h-full bg-warning-dot"
                                : "h-full bg-terracotta/80"
                          }
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4 text-right tabular text-ink-muted">{u.max_devices}</td>
                <td className="px-4 py-4">
                  <span className={expired ? "text-error" : "text-ink-muted"}>
                    {formatDate(u.expires_at)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <IconButton title="编辑" onClick={() => onEdit(u)}>
                      <Pencil className="h-4 w-4" strokeWidth={1.75} />
                    </IconButton>
                    <IconButton title="重置流量" onClick={() => onReset(u)}>
                      <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
                    </IconButton>
                    <IconButton title="删除" danger onClick={() => onDelete(u)}>
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
  )
}

function CreateUserDialog({ onClose, nodes }: { onClose: () => void; nodes: Node[] }) {
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [quotaGb, setQuotaGb] = useState("100")
  const [maxDevices, setMaxDevices] = useState("3")
  const [expiresAt, setExpiresAt] = useState("")
  const [selectedNodes, setSelectedNodes] = useState<string[]>([])
  const [error, setError] = useState("")

  const mutation = useMutation({
    mutationFn: () =>
      api.post("/users", {
        name,
        password,
        quota_bytes: Math.round(parseFloat(quotaGb || "0") * GB),
        max_devices: parseInt(maxDevices, 10) || 1,
        expires_at: expiresAt || null,
        nodes: selectedNodes.length > 0 ? selectedNodes : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
      qc.invalidateQueries({ queryKey: ["nodes"] })
      onClose()
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "创建失败，请重试。")
    },
  })

  const canSubmit = name.trim().length > 0 && password.length >= 4 && !mutation.isPending

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="新建用户"
      description="创建后可立刻分配节点，分配会触发一次下发。"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending ? "创建中…" : "创建"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="用户名" htmlFor="u-name">
            <Input
              id="u-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="alice"
              autoFocus
            />
          </Field>
          <Field label="密码" htmlFor="u-password" hint="至少 4 位，用于节点认证">
            <Input
              id="u-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 4 位"
              type="text"
            />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="流量配额 (GB)" htmlFor="u-quota" hint="0 表示无限制">
            <Input
              id="u-quota"
              type="number"
              min="0"
              step="0.5"
              value={quotaGb}
              onChange={(e) => setQuotaGb(e.target.value)}
            />
          </Field>
          <Field label="设备上限" htmlFor="u-devices">
            <Input
              id="u-devices"
              type="number"
              min="1"
              value={maxDevices}
              onChange={(e) => setMaxDevices(e.target.value)}
            />
          </Field>
          <Field label="到期" htmlFor="u-expires" hint="留空不限期">
            <Input
              id="u-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </Field>
        </div>
        <NodeAssignField nodes={nodes} selected={selectedNodes} onChange={setSelectedNodes} />
        {error && <p className="text-[13px] text-error">{error}</p>}
      </div>
    </Dialog>
  )
}

function EditUserDialog({
  user,
  onClose,
  nodes,
}: {
  user: User
  onClose: () => void
  nodes: Node[]
}) {
  const qc = useQueryClient()
  const [enabled, setEnabled] = useState(user.enabled === 1)
  const [quotaGb, setQuotaGb] = useState(String(bytesToGb(user.quota_bytes ?? 0)))
  const [maxDevices, setMaxDevices] = useState(String(user.max_devices ?? 3))
  const [expiresAt, setExpiresAt] = useState(toIsoDate(user.expires_at))
  const [selectedNodes, setSelectedNodes] = useState<string[]>([])
  const [error, setError] = useState("")

  const assignedQuery = useQuery({
    queryKey: ["user-nodes", user.id],
    queryFn: () => api.get<Node[]>(`/users/${user.id}/nodes`),
  })

  useEffect(() => {
    if (assignedQuery.data) {
      setSelectedNodes(assignedQuery.data.map((n) => n.id))
    }
  }, [assignedQuery.data])

  const mutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/users/${user.id}`, {
        enabled: enabled ? 1 : 0,
        quota_bytes: Math.round(parseFloat(quotaGb || "0") * GB),
        max_devices: parseInt(maxDevices, 10) || 1,
        expires_at: expiresAt || null,
      })
      await api.put(`/users/${user.id}/nodes`, { node_ids: selectedNodes })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
      qc.invalidateQueries({ queryKey: ["user-nodes", user.id] })
      qc.invalidateQueries({ queryKey: ["nodes"] })
      onClose()
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "更新失败，请重试。")
    },
  })

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`编辑 · ${user.name}`}
      description="保存后会立刻同步到所有节点。"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-4">
          <Field label="状态">
            <Select
              value={enabled ? "1" : "0"}
              onChange={(e) => setEnabled(e.target.value === "1")}
            >
              <option value="1">启用</option>
              <option value="0">停用</option>
            </Select>
          </Field>
          <Field label="设备上限" htmlFor="e-devices">
            <Input
              id="e-devices"
              type="number"
              min="1"
              value={maxDevices}
              onChange={(e) => setMaxDevices(e.target.value)}
            />
          </Field>
          <Field label="到期" htmlFor="e-expires">
            <Input
              id="e-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </Field>
        </div>
        <Field label="流量配额 (GB)" htmlFor="e-quota" hint="0 表示无限制">
          <Input
            id="e-quota"
            type="number"
            min="0"
            step="0.5"
            value={quotaGb}
            onChange={(e) => setQuotaGb(e.target.value)}
          />
        </Field>
        <NodeAssignField
          nodes={nodes}
          selected={selectedNodes}
          onChange={setSelectedNodes}
          loading={assignedQuery.isLoading}
        />
        {error && <p className="text-[13px] text-error">{error}</p>}
      </div>
    </Dialog>
  )
}

function NodeAssignField({
  nodes,
  selected,
  onChange,
  loading,
}: {
  nodes: Node[]
  selected: string[]
  onChange: (ids: string[]) => void
  loading?: boolean
}) {
  if (nodes.length === 0) {
    return (
      <Field label="节点分配" hint="暂无可用节点，先到节点页创建。">
        <div />
      </Field>
    )
  }
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }
  const allSelected = selected.length === nodes.length
  return (
    <Field
      label="节点分配"
      hint={loading ? "读取中…" : `已选 ${selected.length} / ${nodes.length}`}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {nodes.map((n) => {
            const isSel = selected.includes(n.id)
            const disabled = n.enabled !== 1
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => !disabled && toggle(n.id)}
                disabled={disabled}
                className={`inline-flex items-center gap-2 px-3 h-8 rounded-full text-[13px] transition-colors ${
                  disabled
                    ? "bg-sand/30 text-stone cursor-not-allowed line-through decoration-stone/40"
                    : isSel
                      ? "bg-terracotta/10 text-terracotta-hover shadow-ring-brand cursor-pointer"
                      : "bg-sand/40 text-olive shadow-ring hover:bg-sand/70 cursor-pointer"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${isSel ? "bg-terracotta" : "bg-silver"}`}
                />
                {n.name}
                {disabled && <span className="text-[11px] text-stone no-underline">停用</span>}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => onChange(allSelected ? [] : nodes.filter((n) => n.enabled === 1).map((n) => n.id))}
          className="self-start text-[13px] text-terracotta hover:text-terracotta-hover transition-colors"
        >
          {allSelected ? "清空" : "全选"}
        </button>
      </div>
    </Field>
  )
}

