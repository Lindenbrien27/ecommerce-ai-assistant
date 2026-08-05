import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// ReUI's "c-accordion-3" pattern (https://reui.io/r/new-york/c-accordion-3.json),
// added via `npx shadcn@latest add @reui/c-accordion-3`. Its own registry
// manifest declares a plain "accordion" dependency (not "@reui/accordion") -
// ReUI's real enhanced primitive (the one their docs site actually uses,
// with a `multiple` boolean + string[] defaultValue) sits behind a paid
// license (https://reui.io/r/new-york/accordion.json 401s without a
// license key), so that dependency resolved to the free, vanilla
// @radix-ui-backed shadcn/ui accordion instead (components/ui/accordion.tsx,
// type="single" | "multiple" API). The two props below are adapted for
// that: `multiple={false}` -> `type="single"`, and `defaultValue={["billing"]}`
// (an array, only valid for type="multiple") -> `defaultValue="billing"`
// (a plain string). Everything else matches the published pattern exactly.
const items = [
  {
    value: "billing",
    trigger: "How does billing work?",
    content:
      "We offer monthly and annual subscription plans. Billing is charged at the beginning of each cycle, and you can cancel anytime. All plans include automatic backups, 24/7 support, and unlimited team members. There are no hidden fees or setup costs.",
  },
  {
    value: "security",
    trigger: "Is my data secure?",
    content:
      "Yes. We use end-to-end encryption, SOC 2 Type II compliance, and regular third-party security audits. All data is encrypted at rest and in transit using industry-standard protocols. We also offer optional two-factor authentication and single sign-on for enterprise customers.",
  },
  {
    value: "integration",
    trigger: "What integrations do you support?",
    content: (
      <>
        <p>
          We integrate with 500+ popular tools including Slack, Zapier,
          Salesforce, HubSpot, and more. You can also build custom integrations
          using our REST API and webhooks.{" "}
        </p>
        <p>
          Our API documentation includes code examples in 10+ programming
          languages.
        </p>
      </>
    ),
  },
];

export function Pattern() {
  return (
    <div className="mx-auto mb-auto w-full max-w-lg">
      <Accordion
        type="single"
        collapsible
        defaultValue="billing"
        className="space-y-2 border-0"
      >
        {items.map((item) => (
          <AccordionItem
            key={item.value}
            value={item.value}
            className="border-border rounded-lg border px-3 not-last:border-b"
          >
            <AccordionTrigger className="items-center py-3 font-medium hover:no-underline">
              {item.trigger}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pt-0 pb-4">
              {item.content}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
