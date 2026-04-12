import { type ReactNode } from "react"

interface PageHeaderProps {
  title: string
  description?: string
  action?: ReactNode
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <h1 className="font-serif text-[32px] font-medium leading-[1.15] tracking-[-0.01em] text-ink">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-[15px] text-olive leading-[1.6]">{description}</p>
        )}
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </header>
  )
}
