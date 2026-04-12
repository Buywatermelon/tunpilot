import { type ReactNode, type LabelHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      {...props}
      className={cn(
        "text-[11px] font-medium uppercase tracking-[0.2em] text-olive",
        className,
      )}
    />
  )
}

interface FieldProps {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  children: ReactNode
  className?: string
}

export function Field({ label, htmlFor, hint, error, children, className }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-[13px] text-error leading-[1.5]">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-olive leading-[1.5]">{hint}</p>
      ) : null}
    </div>
  )
}
