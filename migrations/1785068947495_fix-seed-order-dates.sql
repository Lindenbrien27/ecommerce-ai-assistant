-- Up Migration

-- Two real bugs, both from the same root cause: `created_at` on every seed
-- row was never anything but "whenever this table happened to get seeded"
-- (the column's own DEFAULT now(), per the initial schema migration), which
-- has no relationship to the hand-authored `estimated_delivery` values sat
-- next to it. Once OrderDetailPage started actually displaying created_at
-- as "Ordered on" (see frontend/src/pages/OrderDetailPage.jsx), that
-- mismatch became visible as two concrete, reproducible problems instead
-- of an invisible database implementation detail:
--
-- 1. ORD-1004 shows "Ordered on July 25, 2026" / "Estimated delivery
--    July 25, 2026" - the same date, for a chair that's merely "out for
--    delivery," not delivered. Same-day ordering-to-delivery with no
--    transit time reads as a broken date, not a fast one.
-- 2. ORD-1004's estimated_delivery (2026-07-25) is *already in the past*
--    relative to any date after that, for an order that still isn't
--    marked delivered - a stale estimate nobody ever updated, not
--    something to seed as if it's a normal/expected state.
--
-- Every other order's created_at gets a real, order-appropriate offset
-- from its own estimated_delivery too, not just the one that happened to
-- collide first - the same underlying bug was latent on all five rows,
-- ORD-1004 just made it visible.
--
-- These are still fixed calendar dates, not offsets computed from
-- CURRENT_DATE - the seed data overall already commits to that pattern
-- (estimated_delivery is a plain TEXT column of literal date strings, not
-- an expression), and switching only created_at to a relative computation
-- would just make the *other* half of each pair (estimated_delivery) the
-- next thing to drift stale instead of actually fixing the pattern. A
-- real fix for that is switching estimated_delivery to relative offsets
-- computed at read time, which is a bigger change than this migration's
-- job of correcting the specific dates that are visibly wrong today.

UPDATE orders SET created_at = '2026-07-22T09:00:00Z' WHERE order_number = 'ORD-1001'; -- shipped, estimated_delivery 2026-07-28 unchanged - ~6 days transit
UPDATE orders SET created_at = '2026-07-14T14:30:00Z' WHERE order_number = 'ORD-1002'; -- delivered, estimated_delivery 2026-07-20 unchanged - ~6 days transit, already arrived
UPDATE orders SET created_at = '2026-07-25T11:15:00Z' WHERE order_number = 'ORD-1003'; -- processing, estimated_delivery 2026-08-02 unchanged - placed yesterday, hasn't shipped yet
UPDATE orders SET created_at = '2026-07-20T16:45:00Z', estimated_delivery = '2026-07-27' WHERE order_number = 'ORD-1004'; -- out_for_delivery - estimated_delivery moved off a now-past date to tomorrow, ~7 days transit for a heavier item
UPDATE orders SET created_at = '2026-07-23T10:00:00Z' WHERE order_number = 'ORD-1005'; -- cancelled - placed, then cancelled a few days later

-- Down Migration

UPDATE orders SET created_at = DEFAULT WHERE order_number IN ('ORD-1001', 'ORD-1002', 'ORD-1003', 'ORD-1005');
UPDATE orders SET created_at = DEFAULT, estimated_delivery = '2026-07-25' WHERE order_number = 'ORD-1004';
