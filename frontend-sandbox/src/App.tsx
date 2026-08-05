import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/accordion";
import { ThemeToggle } from "@/components/theme-toggle";

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

function App() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-10 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium text-foreground">Accordion sandbox</h1>
        <ThemeToggle />
      </div>

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
    </main>
  );
}

export default App;
