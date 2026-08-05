import visaIcon from "./icons/visa.svg";
import mastercardIcon from "./icons/mastercard.svg";
import maestroIcon from "./icons/maestro.svg";
import idealIcon from "./icons/ideal.svg";

// Ported from the "shadcn-ui - Design System by ReUI" Figma file (Payment
// Methods component, node 40135:48755). Each brand mark is downloaded as
// one flattened SVG per icon (not hand-recomposed from Figma's individual
// vector layers - several of these, Visa especially, are built from a
// dozen+ separate color-separated paths in the source file) and committed
// locally rather than hotlinked to Figma's own asset URLs, which expire
// after about a week.
//
// INCOMPLETE: the Figma MCP integration hit its plan's rate limit partway
// through fetching this set. Apple Pay, Google Pay, PayPal, WeChat Pay, and
// Klarna are in the Figma file (see the get_design_context output this was
// ported from) but their icons were never actually downloaded - they are
// deliberately NOT stubbed in below with placeholders. Add them the same
// way once the rate limit resets: download_assets with defaultFormat:
// "svg" on each brand's own node id, then a matching entry here.
export const PAYMENT_METHODS = [
  { name: "visa", label: "Visa", icon: visaIcon, background: "#25459a" },
  { name: "mastercard", label: "Mastercard", icon: mastercardIcon, background: "#000000" },
  { name: "maestro", label: "Maestro", icon: maestroIcon, background: "#000000" },
  { name: "ideal", label: "iDEAL", icon: idealIcon, background: "#4f4f4f" },
] as const;

export type PaymentMethodName = (typeof PAYMENT_METHODS)[number]["name"];

function PaymentMethodIcon({ name, className }: { name: PaymentMethodName; className?: string }) {
  const method = PAYMENT_METHODS.find((m) => m.name === name);
  if (!method) return null;
  return (
    <div
      className={className ?? "flex h-[30px] w-10 items-center justify-center overflow-hidden rounded"}
      style={{ backgroundColor: method.background }}
    >
      <img src={method.icon} alt={method.label} className="h-full w-full object-contain" />
    </div>
  );
}

export function PaymentMethodsGrid() {
  return (
    <div className="flex flex-wrap items-start gap-6">
      {PAYMENT_METHODS.map((m) => (
        <PaymentMethodIcon key={m.name} name={m.name} />
      ))}
    </div>
  );
}

export { PaymentMethodIcon };
