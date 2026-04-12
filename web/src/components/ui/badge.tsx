import type { HTMLAttributes } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 h-6 text-[12px] font-medium tracking-[0.02em]",
  {
    variants: {
      tone: {
        neutral: "bg-sand text-ink-muted",
        success: "bg-success-bg text-success-fg",
        warning: "bg-warning-bg text-warning-fg",
        danger: "bg-danger-bg text-danger-fg",
        brand: "bg-brand-bg text-brand-fg",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
)

interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, className }))} {...props} />
}

interface DotProps {
  tone?: "success" | "warning" | "danger" | "neutral"
  className?: string
}

export function StatusDot({ tone = "neutral", className }: DotProps) {
  const color = {
    success: "bg-success-dot",
    warning: "bg-warning-dot",
    danger: "bg-danger-dot",
    neutral: "bg-silver",
  }[tone]
  const halo = {
    success: "shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-success-dot)_20%,transparent)]",
    warning: "shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-warning-dot)_20%,transparent)]",
    danger: "shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-danger-dot)_20%,transparent)]",
    neutral: "",
  }[tone]
  return <span className={cn("inline-block h-1.5 w-1.5 rounded-full", color, halo, className)} />
}
