# Test accounts

Seed data from the initial migration (`migrations/1784973065584_initial-schema.sql`). Login is
email-only now (`/verify`) - enter any of the emails below and request a code. This environment
has no email provider configured (see `.env.example` > `SMTP_*`), so outside production the code
comes back directly in the request response instead of being emailed - the UI shows it right on
the "Enter the code" screen ("Dev mode - no email provider configured...").

Any of these emails work; the orders listed are just what you'll see on the dashboard afterward.
Any *other* email works too - it verifies successfully and lands on an honest empty dashboard,
since there's no such thing as "that email isn't a customer" as a login-time rejection (see
README > Auth for why).

| Email | Orders |
|---|---|
| jane.doe@example.com | ORD-1001 (shipped), ORD-1002 (delivered) |
| john.smith@example.com | ORD-1003 (processing), ORD-1004 (out for delivery) |
| ada.lovelace@example.com | ORD-1005 (cancelled) |
| lindenbrien27@gmail.com | ORD-1006 (shipped), ORD-1007 (delivered) |

Jane and John each have two orders (good for testing the orders list). Ada has one cancelled order.
lindenbrien27@gmail.com is a real inbox, not a placeholder - added so the app's owner can log in with
their own email and land on a populated dashboard instead of the honest-but-empty state described
above (migrations/1785245334753_add-lindenbrien-seed-orders.sql).x