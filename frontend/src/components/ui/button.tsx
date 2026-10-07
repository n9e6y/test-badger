import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Industry buttons: square, hairline-bordered, condensed heading font. The primary is the
// one solid object on the page (steel fill); wrap it in a .blueprint frame for the "+" marks.
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center border border-transparent font-heading text-[15px] font-semibold whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:stroke-[1.75] [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground hover:bg-steel-600 active:bg-steel-700",
        outline:
          "border-border bg-transparent text-foreground hover:bg-accent active:bg-[color-mix(in_srgb,var(--foreground)_14%,transparent)] aria-expanded:bg-accent",
        secondary:
          "border-border bg-transparent text-foreground hover:bg-accent active:bg-[color-mix(in_srgb,var(--foreground)_14%,transparent)]",
        ghost:
          "text-steel-700 hover:bg-steel-100 active:bg-steel-200 aria-expanded:bg-steel-100",
        destructive:
          "border-v-bug-bd bg-v-bug-bg text-v-bug hover:bg-[color-mix(in_srgb,var(--color-v-bug)_14%,var(--color-v-bug-bg))]",
        link: "text-steel-700 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 gap-1.5 px-3.5",
        xs: "h-7 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 px-2.5 text-sm [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-5 text-base",
        icon: "size-10",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
