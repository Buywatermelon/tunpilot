import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ApiError } from "@/lib/api"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface ConfirmDialogProps {
  onClose: () => void
  title: string
  description: string
  confirmLabel: string
  tone?: "primary" | "danger"
  action: () => Promise<unknown>
  invalidate: string[]
}

export function ConfirmDialog({
  onClose,
  title,
  description,
  confirmLabel,
  tone = "danger",
  action,
  invalidate,
}: ConfirmDialogProps) {
  const qc = useQueryClient()
  const [error, setError] = useState("")
  const mutation = useMutation({
    mutationFn: action,
    onSuccess: () => {
      for (const key of invalidate) qc.invalidateQueries({ queryKey: [key] })
      onClose()
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "操作失败，请重试。")
    },
  })

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "处理中…" : confirmLabel}
          </Button>
        </>
      }
    >
      {error && <p className="text-[13px] text-error">{error}</p>}
    </Dialog>
  )
}
