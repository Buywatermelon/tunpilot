import { forwardRef, type SelectHTMLAttributes } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        {...props}
        className={cn(
          "flex h-11 w-full appearance-none rounded-[12px] bg-ivory pl-3.5 pr-9 py-2 text-[15px] text-ink cursor-pointer",
          "border border-border-warm transition-[border-color,box-shadow] duration-150",
          "focus-visible:outline-none focus-visible:border-focus focus-visible:shadow-focus",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone"
        strokeWidth={1.75}
      />
    </div>
  ),
)
Select.displayName = "Select"

export { Select }
