import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, Trash2, Plus, Check } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { formatDate } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Field } from "@/components/ui/field"
import { Dialog } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { IconButton } from "@/components/ui/icon-button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PageHeader } from "@/components/ui/page-header"
import type { Subscription, User, InfoResponse } from "@/types/api"

const FORMATS = [
  { value: "sing-box", label: "sing-box" },
  { value: "clash", label: "Clash" },
  { value: "surge", label: "Surge" },
  { value: "shadowrocket", label: "Shadowrocket" },
] as const

function subUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/sub/${token}`
}

export default function SubscriptionsPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null)

  const subsQuery = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => api.get<Subscription[]>("/subscriptions"),
  })
  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
  })
  const infoQuery = useQuery({
    queryKey: ["info"],
    queryFn: () => api.get<InfoResponse>("/info"),
    staleTime: Infinity,
  })

  const subs = subsQuery.data ?? []
  const users = usersQuery.data ?? []
  const userById = new Map(users.map((u) => [u.id, u]))
  const baseUrl = infoQuery.data?.base_url ?? window.location.origin

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="订阅"
        description="按用户签发的订阅链接，覆盖常用客户端格式。"
        action={
          <Button onClick={() => setCreateOpen(true)} disabled={users.length === 0}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            新建订阅
          </Button>
        }
      />

      <Card className="overflow-hidden">
        {subsQuery.isLoading ? (
          <div className="p-6 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-[10px] bg-sand/40 animate-pulse" />
            ))}
          </div>
        ) : subs.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-serif text-[20px] text-ink leading-[1.3]">还没有订阅</p>
            <p className="mt-2 text-[14px] text-olive max-w-[360px] mx-auto">
              {users.length === 0
                ? "先创建至少一位用户，再为其签发订阅链接。"
                : "为用户签发第一条订阅链接，客户端导入即可使用。"}
            </p>
            {users.length > 0 && (
              <div className="mt-5 inline-flex">
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" strokeWidth={2} />
                  新建订阅
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="border-b border-border-cream text-[11px] uppercase tracking-[0.14em] text-olive">
                  <th className="text-left font-medium px-6 py-3">用户</th>
                  <th className="text-left font-medium px-4 py-3">格式</th>
                  <th className="text-left font-medium px-4 py-3 min-w-[360px]">订阅 URL</th>
                  <th className="text-left font-medium px-4 py-3">创建时间</th>
                  <th className="text-right font-medium px-6 py-3 w-[110px]">操作</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s, i) => {
                  const user = userById.get(s.user_id)
                  const url = subUrl(baseUrl, s.token)
                  return (
                    <tr
                      key={s.id}
                      className={`group ${i > 0 ? "border-t border-border-cream" : ""} hover:bg-sand/25 transition-colors`}
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-ink">{user?.name ?? "—"}</div>
                        <div className="text-[13px] text-olive font-mono truncate max-w-[180px]">
                          {s.user_id}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge tone="brand">{s.format}</Badge>
                      </td>
                      <td className="px-4 py-4">
                        <CopyableUrl url={url} />
                      </td>
                      <td className="px-4 py-4 text-ink-muted">
                        {formatDate(s.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                          <IconButton title="删除" danger onClick={() => setDeleteTarget(s)}>
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

      {createOpen && (
        <CreateSubscriptionDialog users={users} onClose={() => setCreateOpen(false)} />
      )}
      {deleteTarget && (
        <ConfirmDialog
          key={`del-${deleteTarget.id}`}
          onClose={() => setDeleteTarget(null)}
          title="撤销订阅"
          description={`订阅撤销后该链接立即失效，客户端需重新导入。此操作不可撤销。`}
          confirmLabel="撤销"
          action={() => api.delete(`/subscriptions/${deleteTarget.id}`)}
          invalidate={["subscriptions"]}
        />
      )}
    </div>
  )
}

function CopyableUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* ignore */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="group/url inline-flex items-center gap-2 max-w-full text-left cursor-pointer"
      title="点击复制"
    >
      <code className="font-mono text-[13px] text-ink-muted bg-sand/50 px-2.5 py-1 rounded-[6px] truncate max-w-[420px] group-hover/url:bg-sand/80 transition-colors">
        {url}
      </code>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-success-fg" strokeWidth={2} />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0 text-olive group-hover/url:text-ink" strokeWidth={1.75} />
      )}
    </button>
  )
}

function CreateSubscriptionDialog({
  users,
  onClose,
}: {
  users: User[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [userId, setUserId] = useState(users[0]?.id ?? "")
  const [format, setFormat] = useState<(typeof FORMATS)[number]["value"]>("sing-box")
  const [error, setError] = useState("")

  const mutation = useMutation({
    mutationFn: () => api.post(`/users/${userId}/subscriptions`, { format }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] })
      onClose()
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "创建失败，请重试。")
    },
  })

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="新建订阅"
      description="同一用户可为不同客户端签发多条订阅。"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!userId || mutation.isPending}
          >
            {mutation.isPending ? "签发中…" : "签发"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="用户">
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="客户端格式">
          <Select
            value={format}
            onChange={(e) => setFormat(e.target.value as typeof format)}
          >
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        {error && <p className="text-[13px] text-error">{error}</p>}
      </div>
    </Dialog>
  )
}
