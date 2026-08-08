import * as React from "react";
import { Avatar as AvatarPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Ported from the "shadcn-ui - Design System by ReUI" Figma file (Avatar
// component - image / initials / icon fallback, each across a five-step
// size scale, every frame carrying an online status dot). Fallback surface
// and text use this repo's light/dark tokens from dsignRules.md (light: bg
// #f2f2f2 / text #757575, dark: bg #171717 / text #a0a0a0) via `dark:`
// classes - Avatar is a general-purpose primitive that should follow the
// app's theme toggle, unlike Alert Dialog, which deliberately stays fixed.
//
// Root carries no overflow-hidden: the circular clip lives on
// AvatarImage/AvatarFallback individually (each its own rounded-full,
// size-full box), so AvatarStatus can sit as a sibling, absolutely
// positioned at the bottom-right corner, unclipped - that's what lets it
// overlap the avatar's edge with its own ring.

const avatarVariants = cva("relative inline-flex shrink-0", {
  variants: {
    size: {
      xs: "size-8",
      sm: "size-10",
      md: "size-12",
      lg: "size-14",
      xl: "size-16",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

function Avatar({
  className,
  size,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & VariantProps<typeof avatarVariants>) {
  return <AvatarPrimitive.Root data-slot="avatar" className={cn(avatarVariants({ size }), className)} {...props} />;
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("size-full rounded-full object-cover", className)}
      {...props}
    />
  );
}

const avatarFallbackVariants = cva(
  "flex size-full items-center justify-center rounded-full bg-[#f2f2f2] font-medium text-[#757575] dark:bg-[#171717] dark:text-[#a0a0a0]",
  {
    variants: {
      size: {
        xs: "text-[11px] [&>svg]:size-3.5",
        sm: "text-xs [&>svg]:size-4",
        md: "text-sm [&>svg]:size-[18px]",
        lg: "text-base [&>svg]:size-5",
        xl: "text-lg [&>svg]:size-6",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
);

function AvatarFallback({
  className,
  size,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback> & VariantProps<typeof avatarFallbackVariants>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(avatarFallbackVariants({ size }), className)}
      {...props}
    />
  );
}

const avatarStatusVariants = cva("absolute right-0 bottom-0 rounded-full bg-emerald-500 ring-background", {
  variants: {
    size: {
      xs: "size-2 ring-[1.5px]",
      sm: "size-2.5 ring-2",
      md: "size-3 ring-2",
      lg: "size-3.5 ring-2",
      xl: "size-4 ring-[3px]",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

function AvatarStatus({
  className,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof avatarStatusVariants>) {
  return (
    <span data-slot="avatar-status" aria-hidden="true" className={cn(avatarStatusVariants({ size }), className)} {...props} />
  );
}

export { Avatar, AvatarImage, AvatarFallback, AvatarStatus };
