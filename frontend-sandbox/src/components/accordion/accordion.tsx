"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// Ported from the "shadcn-ui - Design System by ReUI" Figma file
// (Accordion / AccordionItem components, node 42725:19802 and 42719:1817).
// Built on @radix-ui/react-accordion (the real primitive shadcn's own
// Accordion wraps) rather than reproducing Figma's static Default/Hover/
// Focus/Disabled variant frames as literal component states - those exist
// in Figma because variants can't express real interaction, but the actual
// component here is genuinely interactive: :hover/:focus-visible/
// :disabled and Radix's own open/closed state drive the same visual
// treatment those frames were designed to preview. The chevron rotates a
// single icon 180deg on open (transition-transform) instead of swapping
// between separate chevron-down/chevron-up assets, for the same reason.

function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b border-border last:border-b-0", className)}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "flex flex-1 items-center justify-between gap-[10px] rounded-lg py-2.5 text-left text-sm font-medium text-foreground outline-none transition-all",
          "hover:underline",
          "focus-visible:border focus-visible:border-ring focus-visible:bg-background focus-visible:shadow-[0_0_0_3px_rgba(161,161,161,0.5)]",
          "disabled:pointer-events-none disabled:opacity-50",
          "[&[data-state=open]>svg]:rotate-180",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-foreground transition-transform duration-200" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden text-sm text-foreground data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      {...props}
    >
      <div className={cn("pb-4", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
