

CREATE TABLE product_reviews (
  id SERIAL PRIMARY KEY,
  product_slug TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  is_guest BOOLEAN NOT NULL DEFAULT true,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_reviews_product_slug ON product_reviews (product_slug);
CREATE INDEX idx_product_reviews_status ON product_reviews (status);

INSERT INTO product_reviews (product_slug, author_name, is_guest, rating, title, body, status, created_at) VALUES
  ('headphones', 'Priya N.', true, 4, 'Great sound, so-so battery', 'Noise cancellation is fantastic on flights. Battery drains faster than advertised if you keep ANC on the whole time.', 'approved', '2026-07-02'),
  ('headphones', 'Marcus T.', true, 5, 'Best headphones I''ve owned', 'Switched from a much pricier brand and honestly prefer these. Comfortable for multi-hour sessions.', 'approved', '2026-07-05'),
  ('headphones', 'Helen T.', true, 2, 'Right ear crackles', 'Started crackling in the right ear after about three weeks of daily use. Left ear is fine.', 'pending', '2026-07-15'),
  ('headphones', 'Dana K.', false, 5, 'Worth the upgrade', 'Had the previous generation, this one fixed every complaint I had. Mic quality especially.', 'approved', '2026-06-28'),
  ('headphones', 'Omar F.', true, 3, 'Good but heavy', 'Sound is excellent but they clamp pretty hard on glasses. Had to loosen them a bit.', 'approved', '2026-06-20'),
  ('headphones', 'Grace L.', true, 5, 'Perfect for the office', 'Blocks out the open-plan chatter completely. Bluetooth pairing with two devices at once works great.', 'approved', '2026-06-11'),
  ('headphones', 'Victor M.', true, 1, 'Stopped charging after a month', 'Charging port seems to have failed. Tried multiple cables, nothing. Requesting a replacement.', 'pending', '2026-07-13'),

  ('keyboard', 'Nathan P.', true, 5, 'Satisfying switches', 'Tactile feedback is exactly what I wanted. Typing all day feels great instead of tiring.', 'approved', '2026-07-08'),
  ('keyboard', 'Ada L.', false, 4, 'Loud but lovely', 'Coworkers have complained about the clack, but I love the feel too much to switch back.', 'approved', '2026-07-01'),
  ('keyboard', 'Sam R.', true, 3, 'A few sticky keys out of the box', 'The spacebar felt sticky when it arrived. Improved after a week of use but still not perfectly smooth.', 'pending', '2026-07-14'),
  ('keyboard', 'Fatima Al-Rashid', true, 5, 'Great for gaming and typing', 'Low input lag for gaming, and the keycaps feel premium. RGB software is a bit clunky though.', 'approved', '2026-06-22'),
  ('keyboard', 'Leo C.', true, 4, 'Solid build quality', 'Feels like it could survive being dropped. Cable is a bit short for my desk setup.', 'approved', '2026-06-15'),
  ('keyboard', 'Ines V.', true, 2, 'Two keys double-register', 'The W and E keys occasionally register two keystrokes for one press. Annoying during fast typing.', 'pending', '2026-07-16'),
  ('keyboard', 'Bilal S.', false, 5, 'Exceeded expectations', 'Wasn''t expecting much at this price point. Genuinely impressed with the switches and the software.', 'approved', '2026-06-05'),

  ('chair', 'Jonas B.', true, 5, 'My back thanks me every day', 'Lumbar support is adjustable enough to actually dial in. Big difference after long work days.', 'approved', '2026-07-10'),
  ('chair', 'Priya N.', true, 3, 'Assembly was rough', 'Chair itself is comfortable but the instructions were unclear and one bolt hole was misaligned.', 'approved', '2026-06-18'),
  ('chair', 'Emma L.', true, 4, 'Comfortable, a bit wide', 'Great cushioning and recline. Armrests are a touch too wide for my desk to tuck all the way in.', 'approved', '2026-06-25'),
  ('chair', 'Derek W.', true, 1, 'Gas lift failed in two weeks', 'Chair started sinking on its own within days. Support has been slow to respond about a replacement part.', 'pending', '2026-07-15'),
  ('chair', 'Nora P.', true, 5, 'Best purchase for WFH', 'Went from a kitchen chair to this and it''s night and day. Mesh back keeps me cool too.', 'approved', '2026-06-09'),
  ('chair', 'Tomas H.', false, 4, 'Sturdy and adjustable', 'Took a bit of fiddling to get the height and tilt tension right, but once set it''s great.', 'approved', '2026-06-01'),
  ('chair', 'Wren S.', true, 3, 'Squeaks after a few months', 'Started squeaking when leaning back. WD-40 on the tilt mechanism helped but shouldn''t be necessary.', 'approved', '2026-05-27'),

  ('monitor', 'Nathan P.', true, 5, 'Crisp 4K at a fair price', 'Text is razor sharp and colors look accurate out of the box. Great for both work and photo editing.', 'approved', '2026-07-11'),
  ('monitor', 'Claire D.', true, 4, 'Great panel, so-so stand', 'Picture quality is excellent. The stand doesn''t swivel much, ended up buying a separate mount.', 'approved', '2026-06-30'),
  ('monitor', 'Yusuf K.', true, 2, 'Backlight bleed on one corner', 'Noticeable backlight bleed in the bottom left corner on dark scenes. Otherwise a great panel.', 'pending', '2026-07-16'),
  ('monitor', 'Helen T.', true, 5, 'Upgraded from 1080p, huge difference', 'Didn''t expect such a jump in clarity for spreadsheets and code. Very happy with this purchase.', 'approved', '2026-06-14'),
  ('monitor', 'Renee A.', false, 4, 'Good value 4K option', 'Not the fastest refresh rate but for productivity work it''s been excellent so far.', 'approved', '2026-06-08'),
  ('monitor', 'Path Nguyen', true, 5, 'Fantastic for design work', 'Color accuracy out of the box was better than my previous calibrated monitor. Very impressed.', 'approved', '2026-05-30'),

  ('cable', 'Emma L.', true, 5, 'Charges fast, feels durable', 'Braided cables have held up well after months of daily use, no fraying at the connector yet.', 'approved', '2026-07-09'),
  ('cable', 'Marcus T.', true, 1, 'One of three stopped working', 'Two of the three cables work fine, the third stopped charging anything after about a week.', 'pending', '2026-07-14'),
  ('cable', 'Grace L.', true, 4, 'Good length options', 'Handy having a short one for my bag and a long one for the desk. Solid value for a 3-pack.', 'approved', '2026-06-19'),
  ('cable', 'Omar F.', true, 5, 'No more tangled drawer', 'Replaced five mismatched cables with these three. Consistent quality across all of them.', 'approved', '2026-06-12'),
  ('cable', 'Ines V.', true, 3, 'Connector fits loosely on one phone', 'Works fine on my tablet but feels a little loose plugging into my phone. Still charges reliably.', 'approved', '2026-05-25'),

  ('cloud-shift-runner', 'Fatima Al-Rashid', true, 3, 'Fit is odd at the ankle', 'Comfortable through the toe box but the ankle cuff is looser than expected. Sizing down might help.', 'pending', '2026-07-11'),
  ('cloud-shift-runner', 'Victor M.', true, 5, 'Cushioning is excellent', 'Ran a half marathon in these with zero foot fatigue. Best running shoe I''ve tried this year.', 'approved', '2026-07-07'),
  ('cloud-shift-runner', 'Nora P.', true, 4, 'Great for daily runs', 'Breaks in quickly and the cushioning holds up well over longer distances. True to size for me.', 'approved', '2026-06-29'),
  ('cloud-shift-runner', 'Derek W.', true, 2, 'Sole wear seems fast', 'Only three weeks in and the outsole is already showing noticeable wear on the heel strike area.', 'pending', '2026-07-15'),
  ('cloud-shift-runner', 'Claire D.', false, 5, 'Lightweight and responsive', 'Feels much lighter than my old trainers without sacrificing support. Great for tempo runs.', 'approved', '2026-06-21'),
  ('cloud-shift-runner', 'Bilal S.', true, 4, 'Good grip, runs slightly warm', 'Traction on wet pavement has been reliable. Mesh upper doesn''t breathe quite as well as expected.', 'approved', '2026-06-13'),
  ('cloud-shift-runner', 'Yusuf K.', true, 5, 'Replaced three pairs with these', 'Tried a few other running shoes this year, these are the ones I keep reaching for.', 'approved', '2026-06-02')
ON CONFLICT DO NOTHING;

DROP TABLE IF EXISTS product_reviews;
