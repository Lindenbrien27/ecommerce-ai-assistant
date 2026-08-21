# Handoff

## What this covers

Two unrelated things happened in this working session, both reflected in the current working tree:

1. A full visual redesign of the app (customer + admin) into one consistent dark ink/brass world.
2. A repo-wide removal of code comments, requested after the redesign was done.

This file exists because the comment removal took with it a lot of "why" context that lived inline. It captures what a future engineer would otherwise have had to reconstruct from git blame.

## Goal / objective

The app (an e-commerce order-support tool: customer order tracking + AI chat assistant + storefront, plus a full admin back office) started on a plain light theme with the customer-facing pages using a shared `--color-*` CSS custom-property system, and the admin section split across three different, disconnected styling approaches (see "Admin's three styling systems" below). The objective was to redesign the entire app — every customer page and every admin page — into one deliberate, distinctive visual identity, continuing page by page rather than as one big-bang rewrite, with the user reviewing and approving direction at each step.

## The design system

**Palette** — a warm dark "ink" ground with a brass accent, not the generic near-black-plus-neon look:

```
--shop-ink:          #16140f   page background
--shop-panel:         #1c1a14   card/surface background
--shop-panel-raised:  #221f18   raised surface (table headers, inputs)
--shop-paper:         #f3efe6   primary text
--shop-paper-dim:      #cbc4b3   secondary text
--shop-paper-faint:    #857f6f   tertiary/placeholder text
--shop-line:          #35322a   borders
--shop-brass:         #c9974f   accent (primary buttons, active states, links)
--shop-brass-dim:      #8a6c3e   accent, dimmer
--shop-brass-ink:      #221a0f   text-on-brass (buttons need dark text on the brass fill, not white — brass is light/mid-tone, so white text fails contrast)
--shop-danger:        #c15b4a   destructive actions
```

Semantic status colors (delivered/green, returned or low-stock/amber, cancelled/rose, active or processing/blue) were deliberately **not** replaced with brass anywhere — they stayed their original hue family. Brass is the one accent; status color is a separate, meaningful signal, and conflating the two would have made both illegible.

**Typography** — three self-hosted fonts (woff2, no CDN, per Artifact/CSP constraints elsewhere in this org, applied here too for consistency): Fraunces (display, used sparingly — page titles and a few receipt/card headlines, weight ~340, often italic), Public Sans (body), IBM Plex Mono (all numbers — prices, order numbers, SKUs, dates, tabular-nums throughout).

**The scoping technique** — this is the load-bearing pattern of the whole redesign, worth understanding before touching any of these files:

Most of this app's CSS already read color from shared `--color-*` custom properties (`--color-bg`, `--color-text`, `--color-border`, `--color-cta`, etc.) rather than hardcoded hex, even before this redesign. That meant re-theming a page didn't require rewriting every rule — it required redefining those custom properties *locally*, scoped to that page's root class (e.g. `.shop-page-root`, `.orders-page-root`, `.admin-dashboard-page`). CSS custom properties inherit down the DOM tree, so every existing rule underneath automatically picks up the new dark/brass values, and nothing outside that scoped subtree is affected — untouched pages stay exactly as they were. Only the handful of rules that hardcoded a literal color (most commonly `color: #fff` sitting on what used to be a solid orange CTA, now brass — white-on-brass fails contrast) needed a direct, targeted override alongside the token block.

Where a shared component (like `ProductImage`'s icon tile, which defaults to `--color-solid-bg`) appears inside a scoped dark page but shouldn't inherit a global remap of that particular token (because the same token drives something elsewhere that should stay untouched, or because a specific occurrence should be neutral rather than accent-colored), it got a targeted descendant-selector override instead — e.g. `.orders-page-root .order-row-summary .product-image { background: var(--shop-panel-raised); }`.

**Admin's three styling systems** — discovered partway through, not something to assume is unified:

1. Some admin pages (Orders, Inventory, Products list, Reviews) were already dark before this session, but with **hardcoded hex values**, not custom properties (`#0a0a0a`/`#171717`/`#434343`/`#fafafa`/`#101010`, a plain neutral-gray palette with no accent color). These needed literal hex-for-hex recoloring, not the token-remap technique.
2. Other admin pages (Login, Dashboard, Order Detail, Promo Codes, Product Edit) were on the same theme-aware `--color-*` system as the customer pages, light by default — these got the normal scoped token-remap.
3. The New Product sheet (and likely other newer admin surfaces not yet touched) runs on **shadcn/ui**, an entirely separate Tailwind/OKLCH theming system (`frontend/src/shadcn.css`, driven by a `.dark` class toggle per shadcn convention). Re-theming it meant adding shadcn's own `dark` class *and* a scoped override retuning shadcn's CSS vars to the same ink/brass palette — the app's `--color-*` tokens have no effect there at all.

Whoever continues this work needs to identify which of these three systems a given admin page is on before editing it — there is no shortcut that covers all three.

## Page-by-page status

**Customer, done:** Shop Now (promo dialog), All Products, Bag/Cart, Checkout (+ Address/Payment/Coupons — these three only have a shared "coming soon" empty state, no real page to redesign further), Orders list (redesigned twice — first the recolor, then restructured from ticket-stub cards into a month-grouped ledger with accordion rows), Order Detail, Product Detail, Wishlist, Chat, Verify (login).

**Admin, done:** Login, Dashboard, Products (list, New Product sheet, Edit page), Inventory (Stock Ledger / Reorder Queue / Purchase Orders — one shared CSS block covers all three), Orders (list + detail — came along for free while doing Customers, since Customers reuses Orders' CSS wholesale), Customers (list + detail), Promo Codes (list + form), Reviews (list + detail drawer).

**Explicitly not done:**
- Shared chrome — the customer `Layout.jsx` (top header/sidebar) and admin `AdminNav.jsx` (sidebar) are both still on the light theme, by deliberate choice made early in the process. Every redesigned page sits as a dark card inside that light frame. This is the one remaining visual seam.
- None of this was checked in a live browser end-to-end — the app sits behind email-OTP login that couldn't be completed in-session. Every change is verified via the automated test suite (173 frontend + 338 backend, all passing) and a clean `npm run build`, not visually.

## The comment removal

Every `//` and `/* */` comment was stripped from the entire codebase (frontend, backend, migrations) using `strip-comments` (JS/JSX) and `strip-css-comments` (CSS), plus a small hand-written stripper for SQL (`--` and `/* */`, string-literal-aware). These were dev-only tools installed with `--no-save` and removed again afterward — `package.json`/`package-lock.json` are unaffected.

**One real bug hit and fixed:** `strip-comments` misidentified the string literal `"/*"` (in `frontend/src/hooks/use-file-upload.js`, a MIME-wildcard check: `type.endsWith("/*")`) as the start of a block comment, and ate real code up to the next coincidental `*/`. Caught because the file no longer parsed. Fixed by hand-restoring the original (recovered from an old `git commit` safety checkpoint made by a prior session, since the file was untracked with no other history) and manually removing its 13 line comments without the buggy tool.

**Verification after the bulk run:** searched every JS/JSX file in that same checkpoint for the same dangerous string pattern (`"/*`, `'/*`, `` `/* ``) — only the one file above matched. Spot-checked three files containing regex literals (a classic comment-stripper confusion point) — all three survived intact. Every JS/JSX file was parse-checked with esbuild (213/213 pass), every backend file with `node --check` (all pass), and the full test suite plus `npm run build` ran clean after the strip. This is strong but not absolute evidence of correctness — a handful of files outside this session's own edits and outside git history had no independent source to diff against, so a very rare silent (non-parse-error) corruption in one of those can't be mathematically ruled out, only made very unlikely.

### Knowledge that lived in now-deleted comments, worth keeping

A few non-obvious things the comments used to explain, which aren't visible from reading the code alone:

- **The `button:hover:not(:disabled)` specificity trap**, mentioned repeatedly across the CSS: a generic sitewide `button:hover:not(:disabled)` rule beats a single-class selector like `.some-button:hover` on specificity even when the single-class rule is more "specific" in spirit — because the generic rule's own `button` type selector plus `:not()` pseudo-class ties or wins the cascade math. Any new bordered-pill/toggle button needs its own explicit `:hover:not(:disabled)` rule with `background: transparent` (or whatever it should be) restated, not assumed inherited.
- **`.some-page *:focus-visible` needs a paired `input:focus-visible` rule** on the always-dark admin pages (Orders, Products, Inventory), because the sitewide `input[type="text"]:focus-visible` rule has higher specificity than a universal selector and would otherwise win for search inputs specifically.
- **`inert` (not `hidden` or conditional unmounting)** is how the Orders list accordion rows stay accessible while visually collapsed — it drops content out of tab order/AT without `display: none`, which would kill the CSS grid-rows height transition outright.
- **The grid-rows accordion trick** (`grid-template-rows: 0fr` → `1fr` on a wrapper, `overflow: hidden` + `min-height: 0` on its child) is how height animates without JavaScript measuring the content first. Requires the content to stay mounted through the transition.
- **Google's Sign-In button is a native widget** (`AdminLoginForm.jsx`) — its `theme` option (`filled_black`, not `outline`) is the only lever available; you cannot restyle it with CSS.
- Product images / icon tiles read `--color-solid-bg` for their gradient background by default. On a page that's *always* dark regardless of the site's own light/dark toggle, that token is deliberately **not** remapped globally (it's shared with unrelated buttons elsewhere that should stay on their own logic) — instead every specific spot a `.product-image` appears inside a dark-scoped page gets its own descendant-selector override. Search for `.product-image { background` overrides per page if one looks wrong.
