import { forwardRef, type ButtonHTMLAttributes } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px]",
    "text-[14px] font-medium transition-[background-color,box-shadow,color] duration-150 ease-out",
    "focus-visible:outline-none focus-visible:shadow-focus",
    "disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-terracotta text-ivory hover:bg-terracotta-hover active:bg-terracotta-deep shadow-ring-brand",
        secondary:
          "bg-sand text-ink-muted hover:bg-sand-hover shadow-ring hover:shadow-ring-deep",
        ghost:
          "bg-transparent text-olive hover:bg-sand/60 hover:text-ink",
        outline:
          "bg-ivory text-ink shadow-ring hover:bg-sand/40",
        danger:
          "bg-transparent text-error hover:bg-error/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-error)_25%,transparent)]",
        link:
          "bg-transparent text-terracotta underline-offset-4 hover:underline px-0",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4",
        lg: "h-11 px-5 text-[15px] rounded-[12px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
)

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
)
Button.displayName = "Button"

export { Button, buttonVariants }
