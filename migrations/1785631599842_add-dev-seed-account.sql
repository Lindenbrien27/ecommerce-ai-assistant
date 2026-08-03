-- Up Migration

-- A dedicated dev/test account, separate from the app owner's own real
-- inbox (lindenbrien27@gmail.com) - logging in never requires a real
-- email provider anyway (see TEST_ACCOUNTS.md and README > Auth: outside
-- production, /api/auth/otp/request returns the code directly in its
-- response as `devCode` whenever SMTP isn't configured), so this account
-- exists purely to have a stable, throwaway identity to test against
-- rather than repurposing a real inbox for it.
-- Both orders delivered and recent deliberately, not one active + one
-- delivered like the other seeds - every other status/filter combination
-- already has an account that covers it (see jane.doe/john.smith/
-- ada.lovelace/lindenbrien27's own seeds), but nothing seeded naturally
-- exercises the Active Order Spotlight's stacked-deck Delivered state
-- (see .spotlight-ghost in index.css / ActiveOrderSpotlight in
-- OrdersPage.jsx) - that state only shows once RECENT_DELIVERY_WINDOW_MS
-- (14 days) finds more than one qualifying delivery. This account is the
-- one place that's true without reaching for mocked data.
-- created_at is relative to now(), not a fixed literal like the other
-- seed migrations use - those go stale the moment real time drifts past
-- their hardcoded 2026 dates (already true of lindenbrien27's own seed),
-- which is fine for orders that just need *a* plausible date, but this
-- account's entire purpose is staying inside a rolling 14-day window
-- indefinitely, so it has to be computed at migration-run time instead.
INSERT INTO orders
  (order_number, customer_email, product_name, status, carrier, tracking_number, estimated_delivery,
   created_at, unit_price_cents, delivery_cost_cents, vat_cents, voucher_cents, voucher_code, product_icon)
VALUES
  ('ORD-1008', 'dev@example.com', 'Wireless Noise-Cancelling Headphones', 'delivered', 'UPS', '1Z999AA10298765433',
   (now() - interval '2 days')::date::text, now() - interval '4 days', 14999, 599, 1200, 0, NULL, 'headphones'),
  ('ORD-1009', 'dev@example.com', 'USB-C Charging Cable (3-pack)', 'delivered', 'USPS', '9400111899223197428411',
   (now() - interval '5 days')::date::text, now() - interval '7 days', 1999, 0, 160, 200, 'WELCOME10', 'cable')
ON CONFLICT (order_number) DO NOTHING;

-- Down Migration

DELETE FROM orders WHERE order_number IN ('ORD-1008', 'ORD-1009');
