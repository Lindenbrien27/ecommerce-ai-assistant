

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

