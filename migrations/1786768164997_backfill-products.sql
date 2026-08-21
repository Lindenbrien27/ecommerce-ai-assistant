

INSERT INTO products (slug, name, description, category, price_cents, original_price_cents, cover_image_url, icon, sku, stock_quantity, colorways) VALUES
('headphones', 'Wireless Noise-Cancelling Headphones', 'Over-ear comfort with active noise cancellation.', 'Audio', 14999, NULL, '/images/products/luke-peterson-lUMj2Zv5HUE-unsplash.jpg', 'headphones', 'AUD-HP-001', 42,
  '[{"id":"black","label":"Black","hex":"#1a1a1a"},{"id":"white","label":"White","hex":"#f2f2f2"},{"id":"navy","label":"Navy","hex":"#1e3a5f"}]'::jsonb),
('keyboard', 'Mechanical Keyboard', 'Tactile switches with per-key backlighting.', 'Peripherals', 8999, 11999, '/images/products/pparnxoxo-vdAR-KDxHNY-unsplash.jpg', 'keyboard', 'PER-KB-002', 18,
  '[{"id":"black","label":"Black","hex":"#1a1a1a"},{"id":"white","label":"White","hex":"#f2f2f2"},{"id":"gray","label":"Gray","hex":"#8a8a8a"}]'::jsonb),
('chair', 'Ergonomic Office Chair', 'Adjustable lumbar support for all-day sitting.', 'Office', 24999, NULL, '/images/products/effydesk-7mfNpV5eJH0-unsplash.jpg', 'chair', 'WRK-CH-003', 7,
  '[{"id":"black","label":"Black","hex":"#1a1a1a"},{"id":"gray","label":"Gray","hex":"#8a8a8a"},{"id":"blue","label":"Blue","hex":"#3b5f8f"}]'::jsonb),
('monitor', '27" 4K Monitor', 'Sharp UHD resolution for work and creative tasks.', 'Displays', 32999, NULL, '/images/products/sebastian-bednarek-x2Z0uNj-Quo-unsplash.jpg', 'monitor', 'DIS-MN-004', 23,
  '[]'::jsonb),
('cable', 'USB-C Charging Cable (3-pack)', 'Fast-charging cables in three lengths.', 'Accessories', 1999, NULL, '/images/products/homemade-media-6l5z2EPrnFc-unsplash.jpg', 'cable', 'ACC-CB-005', 156,
  '[{"id":"white","label":"White","hex":"#f2f2f2"},{"id":"black","label":"Black","hex":"#1a1a1a"}]'::jsonb),
('cloud-shift-runner', 'Cloud Shift Runner', 'Daily road runner with breathable mesh, a single-density foam midsole, and a rubber outsole built for steady miles.', 'Sneakers', 9600, 12800, NULL, 'sneaker', 'SNK-CS-006', 31,
  '[{"id":"cherry","label":"Cherry","hex":"#c81e3a"},{"id":"navy","label":"Navy","hex":"#1e3a5f"},{"id":"white","label":"White","hex":"#f2f2f2"},{"id":"yellow","label":"Yellow","hex":"#f2c14e"},{"id":"green","label":"Green","hex":"#b9e63a"}]'::jsonb);

DELETE FROM products WHERE slug IN ('headphones', 'keyboard', 'chair', 'monitor', 'cable', 'cloud-shift-runner');
