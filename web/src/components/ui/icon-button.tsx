import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface IconButtonProps {
  title: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}

export function IconButton({ title, danger, disabled, onClick, children, className }: IconButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-9 w-9 grid place-items-center rounded-[8px] transition-colors cursor-pointer",
        danger
          ? "text-olive hover:bg-error/10 hover:text-error"
          : "text-olive hover:bg-sand/60 hover:text-ink",
        disabled && "opacity-40 pointer-events-none",
        className,
      )}
    >
      {children}
    </button>
  )
}
