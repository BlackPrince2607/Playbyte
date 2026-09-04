INSERT INTO categories (slug, name, sort_order) VALUES
  ('sports', 'Sports', 1),
  ('cricket', 'Cricket', 2),
  ('news', 'News', 3),
  ('pop-culture', 'Pop Culture', 4),
  ('food', 'Food', 5),
  ('weather', 'Weather', 6),
  ('tech', 'Tech', 7),
  ('music', 'Music', 8),
  ('movies', 'Movies', 9),
  ('social', 'Social', 10),
  ('casual', 'Casual', 11)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO mini_games (key, title, blurb, status, sort_order, config) VALUES
  ('higher_or_lower', 'Higher or Lower', 'Guess if the next number is higher or lower.', 'enabled', 1, '{"maxScore": 50, "rounds": 12}'),
  ('memory_sequence', 'Memory Sequence', 'Watch the sequence and tap it back.', 'enabled', 2, '{"maxScore": 40}'),
  ('traffic_light', 'Traffic Light', 'Tap as soon as it turns green.', 'enabled', 3, '{"maxScore": 1000}'),
  ('timer_stop', 'Timer Stop', 'Stop the clock as close to the target as you can.', 'enabled', 4, '{"targetMs": 9999, "maxScore": 1000}'),
  ('color_match', 'Color Match', 'Tap when the word matches the color.', 'enabled', 5, '{"maxScore": 40}'),
  ('frenzy_tap', 'Frenzy Tap', 'Tap as many times as you can before time runs out.', 'enabled', 6, '{"durationMs": 8000, "maxScore": 200}'),
  ('odd_one_out', 'Odd One Out', 'Find the shape that does not belong.', 'enabled', 7, '{"maxScore": 20}'),
  ('perfect_circle', 'Perfect Circle', 'Draw the roundest circle you can.', 'enabled', 8, '{"maxScore": 100}')
ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title, blurb = EXCLUDED.blurb, config = EXCLUDED.config;
