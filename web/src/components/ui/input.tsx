import { forwardRef, type InputHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-11 w-full rounded-[12px] bg-ivory px-3.5 py-2 text-[15px] text-ink",
        "border border-border-warm transition-[border-color,box-shadow] duration-150",
        "placeholder:text-stone",
        "focus-visible:outline-none focus-visible:border-focus focus-visible:shadow-focus",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = "Input"

export { Input }
