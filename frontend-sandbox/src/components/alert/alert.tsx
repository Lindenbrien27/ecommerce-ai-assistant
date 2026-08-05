import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

// Ported from the "shadcn-ui - Design System by ReUI" Figma file (Alert
// component, node 40246:18832 - "Variant=Deafult"/"Variant=Destructive").
// Structurally its own thing, not vanilla shadcn/ui's grid-based Alert:
// this one is a flex row of explicit named slots (AlertIcon/AlertTitle/
// AlertDescription/AlertAction), with an optional trailing action button -
// kept faithful to that shape rather than forced into shadcn's own layout.

const alertVariants = cva(
  "flex w-full items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-2",
  {
    variants: {
      variant: {
        default: "",
        destructive: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      data-variant={variant ?? "default"}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertIcon({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-icon"
      className={cn(
        "flex shrink-0 items-center py-0.5 [&>svg]:size-4",
        "[[data-variant=default]_&]:text-foreground [[data-variant=destructive]_&]:text-destructive",
        className
      )}
      {...props}
    >
      {children ?? <Info />}
    </div>
  );
}

function AlertText({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-text"
      className={cn("flex min-w-0 flex-1 flex-col justify-center gap-0.5", className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "text-sm font-medium",
        "[[data-variant=default]_&]:text-card-foreground [[data-variant=destructive]_&]:text-destructive",
        className
      )}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm",
        "[[data-variant=default]_&]:text-muted-foreground [[data-variant=destructive]_&]:text-destructive/90",
        className
      )}
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("flex shrink-0 flex-col items-start justify-center", className)}
      {...props}
    />
  );
}

export { Alert, AlertIcon, AlertText, AlertTitle, AlertDescription, AlertAction };
