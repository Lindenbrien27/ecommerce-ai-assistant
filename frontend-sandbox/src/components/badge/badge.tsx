import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

// Ported from the "shadcn-ui - Design System by ReUI" Figma file (Badge
// component). The Figma file is an exhaustive QA matrix - five sizes x
// outline/solid/soft styles x six colors x every slot combination (leading
// dot, avatar, icon, trailing dot, dismiss), each shown separately in both
// light and dark mode - not a set of fixed components to copy one-for-one.
// That matrix is reproduced here as real variant axes (`size`, `variant`,
// `color`) plus composable children (dot, avatar, icon, text, dismiss),
// the same way Alert exposes AlertIcon/AlertTitle/AlertAction as slots
// rather than baking every combination into its own component.
//
// `solid` stays a fixed dark chip in both themes (not inverted foreground/
// background) - that's what the Figma frames show in both their light- and
// dark-mode sections, so it reads as a deliberate "always-dark" badge
// style, not a theme-relative one.

const badgeVariants = cva(
  "inline-flex w-fit items-center justify-center gap-1.5 rounded-full border font-medium whitespace-nowrap [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        outline: "border-border bg-transparent text-foreground",
        solid: "border-transparent bg-neutral-900 text-neutral-50 dark:bg-neutral-800",
        soft: "border-transparent bg-neutral-100 text-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300",
      },
      color: {
        default: "",
        red: "",
        blue: "",
        green: "",
        purple: "",
        orange: "",
      },
      size: {
        xs: "h-5 px-2 text-[11px] [&_svg]:size-3",
        sm: "h-6 px-2.5 text-xs [&_svg]:size-3",
        md: "h-7 px-3 text-sm [&_svg]:size-3.5",
        lg: "h-8 px-3.5 text-sm [&_svg]:size-4",
        xl: "h-9 px-4 text-base [&_svg]:size-4",
      },
    },
    compoundVariants: [
      { variant: "soft", color: "red", className: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
      { variant: "soft", color: "blue", className: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400" },
      {
        variant: "soft",
        color: "green",
        className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
      },
      {
        variant: "soft",
        color: "purple",
        className: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400",
      },
      {
        variant: "soft",
        color: "orange",
        className: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
      },
      { variant: "outline", color: "red", className: "border-red-300 text-red-700 dark:border-red-500/40 dark:text-red-400" },
      {
        variant: "outline",
        color: "blue",
        className: "border-blue-300 text-blue-700 dark:border-blue-500/40 dark:text-blue-400",
      },
      {
        variant: "outline",
        color: "green",
        className: "border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-400",
      },
      {
        variant: "outline",
        color: "purple",
        className: "border-purple-300 text-purple-700 dark:border-purple-500/40 dark:text-purple-400",
      },
      {
        variant: "outline",
        color: "orange",
        className: "border-orange-300 text-orange-700 dark:border-orange-500/40 dark:text-orange-400",
      },
    ],
    defaultVariants: {
      variant: "outline",
      color: "default",
      size: "md",
    },
  }
);

function Badge({
  className,
  variant,
  color,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant, color, size }), className)} {...props} />;
}

function BadgeDot({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="badge-dot" aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full bg-current", className)} {...props} />;
}

function BadgeDismiss({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-slot="badge-dismiss"
      className={cn("-mr-1 flex shrink-0 items-center justify-center rounded-full opacity-60 outline-none transition-opacity hover:opacity-100", className)}
      {...props}
    >
      <X />
    </button>
  );
}

export { Badge, BadgeDot, BadgeDismiss };
