import { useState } from "react";

import { Circle, Plus, Users } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/accordion";
import { Pattern as AccordionWithBorders } from "@/components/accordion/c-accordion-3";
import { Alert, AlertAction, AlertDescription, AlertIcon, AlertTitle } from "@/components/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogIcon,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage, AvatarStatus } from "@/components/avatar";
import { Badge, BadgeDismiss, BadgeDot } from "@/components/badge";
import { Pattern as BreadcrumbPattern } from "@/components/breadcrumb/c-breadcrumb-1";
import { Pattern as ButtonGroupPattern } from "@/components/button-group/c-button-group-1";
import { Pattern as CardPattern } from "@/components/card/c-card-10";
import { Pattern as ChartPattern } from "@/components/chart/c-chart-20";
import { Pattern as CheckboxPattern } from "@/components/checkbox/c-checkbox-14";
import { Pattern as CollapsiblePattern } from "@/components/collapsible/c-collapsible-9";
import { Pattern as ComboboxPattern } from "@/components/combobox/c-combobox-22";
import { Pattern as CommandPattern } from "@/components/command/c-command-6";
import { Pattern as ContextMenuPattern } from "@/components/context-menu/c-context-menu-2";
import { Pattern as DataGridPattern } from "@/components/data-grid/c-data-grid-1";
import { Pattern as DateSelectorPattern } from "@/components/date-selector/c-date-selector-1";
import { Pattern as DialogPattern } from "@/components/dialog/c-dialog-5";
import { Pattern as DrawerPattern } from "@/components/drawer/c-drawer-1";
import { Pattern as DropdownMenuPattern } from "@/components/dropdown-menu/c-dropdown-menu-9";
import { Pattern as EmptyPattern } from "@/components/empty/c-empty-1";
import { Pattern as EventCalendarPattern } from "@/components/event-calendar/c-event-calendar-1";
import { Pattern as FieldPattern } from "@/components/field/c-field-1";
import { FileTypesGrid } from "@/components/file-types";
import { Pattern as FileUploadPattern } from "@/components/file-upload/c-file-upload-1";
import { Pattern as FiltersPattern } from "@/components/filters/c-filters-1";
import { Pattern as FramePattern } from "@/components/frame/c-frame-1";
import { Pattern as GanttPattern } from "@/components/gantt/c-gantt-1";
import { Pattern as HoverCardPattern } from "@/components/hover-card/c-hover-card-1";
import { Pattern as IconStackPattern } from "@/components/icon-stack/c-icon-stack-1";
import { Pattern as IconTilePattern } from "@/components/icon-tile/c-icon-tile-1";
import { Pattern as InputPattern } from "@/components/input/c-input-1";
import { Pattern as InputGroupPattern } from "@/components/input-group/c-input-group-1";
import { Pattern as InputOTPPattern } from "@/components/input-otp/c-input-otp-1";
import { Pattern as ItemPattern } from "@/components/item/c-item-1";
import { PaymentMethodsGrid } from "@/components/payment-methods";
import { ThemeToggle } from "@/components/theme-toggle";
import { TooltipProvider } from "@/components/ui/tooltip";

const FAQ_ITEMS = [
  {
    value: "item-1",
    trigger: "Is it accessible?",
    content: "Yes. It adheres to the WAI-ARIA design pattern, built on Radix UI's Accordion primitive.",
  },
  {
    value: "item-2",
    trigger: "Is it styled?",
    content: "Yes. It comes with default styles that match the rest of the design system.",
  },
  {
    value: "item-3",
    trigger: "Is it animated?",
    content: "Yes. It's animated by default, but you can disable it if you prefer.",
  },
];

// One entry per component directory (src/components/*), not per demo
// variant - "Accordion" holds all five accordion examples (Basic/Border/
// Card/ReUI/Disabled) together, since they're all still the same
// component under test, just styled differently. Sidebar nav, not
// react-router - this is a component sandbox, not an app with real
// routes/deep-links, so plain useState is enough to swap which section
// is visible.
const SECTIONS = [
  "Accordion",
  "Alert",
  "Alert Dialog",
  "Avatar",
  "Badge",
  "Breadcrumb",
  "Button Group",
  "Card",
  "Chart",
  "Checkbox",
  "Collapsible",
  "Combobox",
  "Command",
  "Context Menu",
  "Data Grid",
  "Date Selector",
  "Dialog",
  "Drawer",
  "Dropdown Menu",
  "Empty",
  "Event Calendar",
  "Field",
  "File Types",
  "File Upload",
  "Filters",
  "Frame",
  "Gantt",
  "Hover Card",
  "Icon Stack",
  "Icon Tile",
  "Input",
  "Input Group",
  "Input OTP",
  "Item",
  "Payment Methods",
] as const;
type Section = (typeof SECTIONS)[number];

function AccordionSection() {
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Basic</h2>
        <Accordion type="single" collapsible>
          {FAQ_ITEMS.map((item) => (
            <AccordionItem key={item.value} value={item.value}>
              <AccordionTrigger>{item.trigger}</AccordionTrigger>
              <AccordionContent>{item.content}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Border</h2>
        {/* px-4 lives on each item (padding, not margin), not on the Accordion
            wrapper - that way the item's own border-b still spans the full
            box (flush with the rounded border on both sides); only the
            trigger/content text is inset. Padding on the wrapper instead
            would leave the divider stopping short of the border on both
            ends, which is the bug this fixes. */}
        <Accordion type="single" collapsible className="rounded-xl border border-border">
          {FAQ_ITEMS.map((item) => (
            <AccordionItem key={item.value} value={item.value} className="px-4 last:border-b-0">
              <AccordionTrigger>{item.trigger}</AccordionTrigger>
              <AccordionContent>{item.content}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Card</h2>
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex flex-col gap-1 pb-4">
            <p className="text-base font-medium text-card-foreground">Card Title</p>
            <p className="text-sm text-muted-foreground">Card header description</p>
          </div>
          <Accordion type="single" collapsible>
            {FAQ_ITEMS.map((item) => (
              <AccordionItem key={item.value} value={item.value}>
                <AccordionTrigger>{item.trigger}</AccordionTrigger>
                <AccordionContent>{item.content}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          ReUI c-accordion-3 (borders and rounded corners)
        </h2>
        <AccordionWithBorders />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Disabled item</h2>
        <Accordion type="single" collapsible>
          <AccordionItem value="a">
            <AccordionTrigger>Trigger Label</AccordionTrigger>
            <AccordionContent>The body of Accordion Component.</AccordionContent>
          </AccordionItem>
          <AccordionItem value="b" disabled>
            <AccordionTrigger>Trigger Label (disabled)</AccordionTrigger>
            <AccordionContent>The body of Accordion Component.</AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
    </>
  );
}

function AlertSection() {
  return (
    <section className="flex flex-col gap-3">
      <Alert>
        <AlertIcon />
        <AlertTitle>License Info</AlertTitle>
      </Alert>

      <Alert>
        <AlertIcon />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <AlertTitle>License Info</AlertTitle>
          <AlertDescription>Your license will expire on October 17th, 2027 at midnight</AlertDescription>
        </div>
      </Alert>

      <Alert>
        <AlertIcon />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <AlertTitle>License Info</AlertTitle>
          <AlertDescription>Your license will expire on October 17th, 2027 at midnight</AlertDescription>
        </div>
        <AlertAction>
          <button
            type="button"
            className="flex h-7 items-center justify-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-2xs"
          >
            Review
          </button>
        </AlertAction>
      </Alert>

      <Alert variant="destructive">
        <AlertIcon />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <AlertTitle>License Info</AlertTitle>
          <AlertDescription>Your license will expire on October 17th, 2027 at midnight</AlertDescription>
        </div>
      </Alert>

      <Alert variant="destructive">
        <AlertIcon />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <AlertTitle>License Info</AlertTitle>
          <AlertDescription>Your license will expire on October 17th, 2027 at midnight</AlertDescription>
        </div>
        <AlertAction>
          <button
            type="button"
            className="flex h-7 items-center justify-center rounded-md bg-destructive/10 px-2.5 text-xs font-medium text-destructive"
          >
            Decline
          </button>
        </AlertAction>
      </Alert>
    </section>
  );
}

function AlertDialogSection() {
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Inline, default</h2>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="flex h-9 w-fit items-center justify-center rounded-md border border-border bg-card px-3.5 text-sm font-medium text-foreground shadow-2xs hover:bg-card/80"
            >
              Delete account
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogIcon>
                <Users />
              </AlertDialogIcon>
              <div className="flex flex-col gap-1">
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete your account from our servers.
                </AlertDialogDescription>
              </div>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Delete account</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Inline, destructive</h2>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="flex h-9 w-fit items-center justify-center rounded-md border border-border bg-card px-3.5 text-sm font-medium text-foreground shadow-2xs hover:bg-card/80"
            >
              Delete account
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogIcon variant="destructive">
                <Users />
              </AlertDialogIcon>
              <div className="flex flex-col gap-1">
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete your account from our servers.
                </AlertDialogDescription>
              </div>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive">Delete account</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Centered, default</h2>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="flex h-9 w-fit items-center justify-center rounded-md border border-border bg-card px-3.5 text-sm font-medium text-foreground shadow-2xs hover:bg-card/80"
            >
              Delete account
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader className="flex-col items-center text-center">
              <AlertDialogIcon>
                <Users />
              </AlertDialogIcon>
              <div className="flex flex-col items-center gap-1">
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete your account from our servers.
                </AlertDialogDescription>
              </div>
            </AlertDialogHeader>
            <AlertDialogFooter className="justify-center">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Delete account</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Centered, destructive</h2>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="flex h-9 w-fit items-center justify-center rounded-md border border-border bg-card px-3.5 text-sm font-medium text-foreground shadow-2xs hover:bg-card/80"
            >
              Delete account
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader className="flex-col items-center text-center">
              <AlertDialogIcon variant="destructive">
                <Users />
              </AlertDialogIcon>
              <div className="flex flex-col items-center gap-1">
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete your account from our servers.
                </AlertDialogDescription>
              </div>
            </AlertDialogHeader>
            <AlertDialogFooter className="justify-center">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive">Delete account</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </>
  );
}

const AVATAR_SIZES = ["xs", "sm", "md", "lg", "xl"] as const;

function AvatarSection() {
  return (
    <section className="flex flex-col gap-6">
      {AVATAR_SIZES.map((size) => (
        <div key={size} className="flex items-center gap-6">
          <Avatar size={size}>
            <AvatarImage src="https://i.pravatar.cc/200?img=68" alt="" />
            <AvatarFallback size={size}>CN</AvatarFallback>
            <AvatarStatus size={size} />
          </Avatar>

          <Avatar size={size}>
            <AvatarFallback size={size}>CN</AvatarFallback>
            <AvatarStatus size={size} />
          </Avatar>

          <Avatar size={size}>
            <AvatarFallback size={size}>
              <Plus />
            </AvatarFallback>
            <AvatarStatus size={size} />
          </Avatar>
        </div>
      ))}
    </section>
  );
}

const BADGE_SIZES = ["xs", "sm", "md", "lg", "xl"] as const;
const BADGE_COLORS = ["red", "blue", "green", "purple", "orange"] as const;

function BadgeSection() {
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Sizes</h2>
        <div className="flex flex-wrap items-center gap-3">
          {BADGE_SIZES.map((size) => (
            <Badge key={size} size={size}>
              badge-{size}
            </Badge>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">With icon</h2>
        <div className="flex flex-wrap items-center gap-3">
          {BADGE_SIZES.map((size) => (
            <Badge key={size} size={size}>
              badge-{size}
              <Circle />
            </Badge>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">With dot + avatar</h2>
        <div className="flex flex-wrap items-center gap-3">
          {BADGE_SIZES.map((size) => (
            <Badge key={size} size={size}>
              <BadgeDot className="text-blue-500" />
              <Avatar size="xs" className="-mx-0.5">
                <AvatarFallback size="xs">CN</AvatarFallback>
              </Avatar>
              <Circle />
              badge-{size}
            </Badge>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Variants</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">Outline</Badge>
          <Badge variant="solid">Solid</Badge>
          <Badge variant="soft">Soft</Badge>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Colors</h2>
        <div className="flex flex-wrap items-center gap-3">
          {BADGE_COLORS.map((color) => (
            <Badge key={color} variant="soft" color={color}>
              badge-{color}
            </Badge>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Dismissible</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="soft" color="blue">
            badge
            <BadgeDismiss aria-label="Remove" />
          </Badge>
        </div>
      </section>
    </>
  );
}

function BreadcrumbSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-breadcrumb-1</h2>
      <BreadcrumbPattern />
    </section>
  );
}

function ButtonGroupSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-button-group-1</h2>
      <ButtonGroupPattern />
    </section>
  );
}

function CardSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-card-10</h2>
      <CardPattern />
    </section>
  );
}

function ChartSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-chart-20</h2>
      <ChartPattern />
    </section>
  );
}

function CheckboxSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-checkbox-14</h2>
      <CheckboxPattern />
    </section>
  );
}

function CollapsibleSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-collapsible-9</h2>
      <CollapsiblePattern />
    </section>
  );
}

function ComboboxSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-combobox-22</h2>
      <ComboboxPattern />
    </section>
  );
}

function CommandSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-command-6</h2>
      <CommandPattern />
    </section>
  );
}

function ContextMenuSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-context-menu-2</h2>
      <ContextMenuPattern />
    </section>
  );
}

function DataGridSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-data-grid-1</h2>
      <DataGridPattern />
    </section>
  );
}

function DateSelectorSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-date-selector-1</h2>
      <DateSelectorPattern />
    </section>
  );
}

function DialogSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-dialog-5</h2>
      <DialogPattern />
    </section>
  );
}

function DrawerSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-drawer-1</h2>
      <DrawerPattern />
    </section>
  );
}

function DropdownMenuSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-dropdown-menu-9</h2>
      <DropdownMenuPattern />
    </section>
  );
}

function EmptySection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-empty-1</h2>
      <EmptyPattern />
    </section>
  );
}

function EventCalendarSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-event-calendar-1</h2>
      <EventCalendarPattern />
    </section>
  );
}

function FieldSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-field-1</h2>
      <FieldPattern />
    </section>
  );
}

function FileTypesSection() {
  return (
    <section className="flex flex-col gap-3">
      <FileTypesGrid />
    </section>
  );
}

function FileUploadSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-file-upload-1</h2>
      <FileUploadPattern />
    </section>
  );
}

function FiltersSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-filters-1</h2>
      <FiltersPattern />
    </section>
  );
}

function FrameSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-frame-1</h2>
      <FramePattern />
    </section>
  );
}

function GanttSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-gantt-1</h2>
      <GanttPattern />
    </section>
  );
}

function HoverCardSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-hover-card-1</h2>
      <HoverCardPattern />
    </section>
  );
}

function IconStackSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-icon-stack-1</h2>
      <IconStackPattern />
    </section>
  );
}

function IconTileSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-icon-tile-1</h2>
      <IconTilePattern />
    </section>
  );
}

function InputSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-input-1</h2>
      <InputPattern />
    </section>
  );
}

function InputGroupSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-input-group-1</h2>
      <InputGroupPattern />
    </section>
  );
}

function InputOTPSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-input-otp-1</h2>
      <InputOTPPattern />
    </section>
  );
}

function ItemSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ReUI c-item-1</h2>
      <ItemPattern />
    </section>
  );
}

function PaymentMethodsSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">4 of 9 - see component comment</h2>
      <PaymentMethodsGrid />
    </section>
  );
}

const SECTION_CONTENT: Record<Section, () => React.JSX.Element> = {
  Accordion: AccordionSection,
  Alert: AlertSection,
  "Alert Dialog": AlertDialogSection,
  Avatar: AvatarSection,
  Badge: BadgeSection,
  Breadcrumb: BreadcrumbSection,
  "Button Group": ButtonGroupSection,
  Card: CardSection,
  Chart: ChartSection,
  Checkbox: CheckboxSection,
  Collapsible: CollapsibleSection,
  Combobox: ComboboxSection,
  Command: CommandSection,
  "Context Menu": ContextMenuSection,
  "Data Grid": DataGridSection,
  "Date Selector": DateSelectorSection,
  Dialog: DialogSection,
  Drawer: DrawerSection,
  "Dropdown Menu": DropdownMenuSection,
  Empty: EmptySection,
  "Event Calendar": EventCalendarSection,
  Field: FieldSection,
  "File Types": FileTypesSection,
  "File Upload": FileUploadSection,
  Filters: FiltersSection,
  Frame: FrameSection,
  Gantt: GanttSection,
  "Hover Card": HoverCardSection,
  "Icon Stack": IconStackSection,
  "Icon Tile": IconTileSection,
  Input: InputSection,
  "Input Group": InputGroupSection,
  "Input OTP": InputOTPSection,
  Item: ItemSection,
  "Payment Methods": PaymentMethodsSection,
};

function App() {
  const [active, setActive] = useState<Section>("Accordion");
  const ActiveContent = SECTION_CONTENT[active];

  return (
    // TooltipProvider wraps the whole shell (not just EventCalendarSection)
    // since it's a single app-wide context, same as ThemeToggle's own
    // provider - the event calendar is the first section that needs it, but
    // any future section using Tooltip needs this ancestor too.
    <TooltipProvider>
      {/* h-svh + overflow-hidden on the outer shell, not min-h-svh on a
          single scrolling column - the sidebar stays fixed/always visible
          while only the content pane scrolls, same "app shell" treatment as
          the main app's .storefront-shell (height:100%/overflow:hidden
          there, svh unit here since there's no #root/body chain of explicit
          heights to thread through for a %-based approach to work). */}
      <div className="mx-auto flex h-svh max-w-4xl">
        <aside className="flex w-52 shrink-0 flex-col gap-6 border-r border-border px-4 py-6">
          <div className="flex items-center justify-between px-2">
            <span className="text-sm font-medium text-foreground">Sandbox</span>
            <ThemeToggle />
          </div>
          <nav className="flex flex-col gap-1">
            {SECTIONS.map((section) => (
              <button
                key={section}
                type="button"
                onClick={() => setActive(section)}
                aria-current={active === section ? "page" : undefined}
                className={
                  active === section
                    ? "rounded-md bg-primary px-2.5 py-1.5 text-left text-sm font-medium text-primary-foreground"
                    : "rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-muted-foreground hover:bg-card hover:text-foreground"
                }
              >
                {section}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex flex-1 flex-col gap-6 overflow-y-auto px-8 py-10">
          <h1 className="text-lg font-medium text-foreground">{active}</h1>
          <ActiveContent />
        </main>
      </div>
    </TooltipProvider>
  );
}

export default App;
