-- Up Migration

-- Every order seeded so far belongs to one of these five customers (see
-- migrations/1784973065584_initial-schema.sql,
-- 1785245334753_add-lindenbrien-seed-orders.sql,
-- 1785410305029_add-lindenbrien-volume-history-orders.sql,
-- 1785631599842_add-dev-seed-account.sql). Keyed on customer_email, not
-- order_number, since backfilling one real address per customer is
-- simpler and just as plausible as inventing a distinct one per order.

UPDATE orders SET
  recipient_name = 'Jane Doe',
  address_line1 = '482 Maple Street',
  address_line2 = NULL,
  city = 'Austin',
  state = 'TX',
  postal_code = '78701',
  country = 'US'
WHERE customer_email = 'jane.doe@example.com';

UPDATE orders SET
  recipient_name = 'John Smith',
  address_line1 = '910 Birch Avenue',
  address_line2 = 'Unit 4B',
  city = 'Denver',
  state = 'CO',
  postal_code = '80202',
  country = 'US'
WHERE customer_email = 'john.smith@example.com';

UPDATE orders SET
  recipient_name = 'Ada Lovelace',
  address_line1 = '17 Analytical Engine Way',
  address_line2 = NULL,
  city = 'Cambridge',
  state = 'MA',
  postal_code = '02139',
  country = 'US'
WHERE customer_email = 'ada.lovelace@example.com';

UPDATE orders SET
  recipient_name = 'Linden Brien',
  address_line1 = '1200 Riverside Drive',
  address_line2 = 'Apt 7',
  city = 'Portland',
  state = 'OR',
  postal_code = '97201',
  country = 'US'
WHERE customer_email = 'lindenbrien27@gmail.com';

UPDATE orders SET
  recipient_name = 'Dev Account',
  address_line1 = '1 Test Fixture Lane',
  address_line2 = NULL,
  city = 'Springfield',
  state = 'IL',
  postal_code = '62701',
  country = 'US'
WHERE customer_email = 'dev@example.com';

-- Down Migration

-- No-op: reverting this migration means "forget the addresses," which the
-- schema migration's own down (dropping the columns entirely) already
-- covers. Nothing to explicitly undo here.