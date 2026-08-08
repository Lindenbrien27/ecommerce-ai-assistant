import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Ported from the "shadcn-ui - Design System by ReUI" Figma file (Alert
// Dialog component), then redesigned to the letter against this repo's
// dark-mode design rules (dsignRules.md), which has its own dedicated
// "alert dialog" section:
//   surface #171717, title #e0e0e0, text #a0a0a0,
//   background after divider #1f1f1f,
//   destructive button: bg #4c2d2d / color #ff6467,
//   destructive icon: bg #2e1f1f / color #ff6467 (a different, subtler bg
//   than the destructive button - the icon is a static chip, the button is
//   a control and gets more presence).
// The divider itself uses the doc's general dark-mode divider color
// (#353535, full-bleed left-to-right) - a real line at the seam where the
// header's #171717 meets the footer's #1f1f1f, not a blended/invisible one.
//
// Cancel has no fill of its own - it sits directly on the footer's #1f1f1f
// (that IS its background, per the doc) and reads via a border (the
// general stroke token, #434343) and text color alone. The non-destructive
// confirm button isn't specified by the doc, so it keeps the one deliberate
// break from the rest of the system: an inverted light fill, the only
// element allowed to be louder than the surface.
//
// Intentionally theme-independent (always dark), not wired to the app's
// light/dark --card/--border tokens - a confirmation dialog earns its own
// fixed, weightier surface regardless of the page it interrupts.

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AlertDialogPortal = AlertDialogPrimitive.Portal;

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-300",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-200",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-full max-w-[380px] -translate-x-1/2 -translate-y-1/2 overflow-hidden",
          "rounded-2xl border border-[#434343] bg-[#171717] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.6)] outline-none",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-200",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150",
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-dialog-header" className={cn("flex gap-3.5 bg-[#171717] p-6", className)} {...props} />;
}

const alertDialogIconVariants = cva("flex size-10 shrink-0 items-center justify-center rounded-lg [&>svg]:size-5", {
  variants: {
    variant: {
      default: "bg-[#1f1f1f] text-[#a0a0a0]",
      destructive: "bg-[#2e1f1f] text-[#ff6467]",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

function AlertDialogIcon({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertDialogIconVariants>) {
  return <div data-slot="alert-dialog-icon" className={cn(alertDialogIconVariants({ variant }), className)} {...props} />;
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-base font-medium tracking-[-0.01em] text-[#e0e0e0]", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-sm leading-relaxed text-[#a0a0a0]", className)}
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn("flex items-center justify-end gap-2 border-t border-[#353535] bg-[#1f1f1f] px-6 py-4", className)}
      {...props}
    />
  );
}

const alertDialogActionVariants = cva("flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors", {
  variants: {
    variant: {
      default: "bg-[#e0e0e0] text-[#171717] hover:bg-white",
      destructive: "bg-[#4c2d2d] text-[#ff6467] hover:bg-[#5a3636]",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

function AlertDialogAction({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & VariantProps<typeof alertDialogActionVariants>) {
  return (
    <AlertDialogPrimitive.Action
      data-slot="alert-dialog-action"
      className={cn(alertDialogActionVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      data-slot="alert-dialog-cancel"
      className={cn(
        "flex h-9 items-center justify-center rounded-lg border border-[#434343] bg-transparent px-4 text-sm font-medium text-[#a0a0a0] transition-colors hover:text-[#e0e0e0]",
        className
      )}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogIcon,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
};
