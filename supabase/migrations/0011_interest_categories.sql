-- Interest picker categories (feed onboarding picks).
-- Merges: k-drama→kpop, science→tech, social→personality-vibe, entertainment→movies.
-- Hides: politics, weather, casual (+ merged leftovers). Adds gaming / puzzles / logic / math.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Remap interests that would collide after a merge, then move the rest.
CREATE OR REPLACE FUNCTION _remap_category(from_slug text, to_slug text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  from_id uuid;
  to_id uuid;
BEGIN
  SELECT id INTO from_id FROM categories WHERE slug = from_slug;
  SELECT id INTO to_id FROM categories WHERE slug = to_slug;
  IF from_id IS NULL OR to_id IS NULL OR from_id = to_id THEN
    RETURN;
  END IF;

  DELETE FROM user_interests ui
  WHERE ui.category_id = from_id
    AND EXISTS (
      SELECT 1 FROM user_interests x
      WHERE x.user_id = ui.user_id AND x.category_id = to_id
    );
  UPDATE user_interests SET category_id = to_id WHERE category_id = from_id;

  DELETE FROM guest_interests gi
  WHERE gi.category_id = from_id
    AND EXISTS (
      SELECT 1 FROM guest_interests x
      WHERE x.guest_session_id = gi.guest_session_id AND x.category_id = to_id
    );
  UPDATE guest_interests SET category_id = to_id WHERE category_id = from_id;

  UPDATE moments SET category_id = to_id WHERE category_id = from_id;
  UPDATE content_windows SET category_id = to_id WHERE category_id = from_id;
END;
$$;

SELECT _remap_category('k-drama', 'kpop');
SELECT _remap_category('science', 'tech');
SELECT _remap_category('social', 'personality-vibe');
SELECT _remap_category('entertainment', 'movies');

DROP FUNCTION _remap_category(text, text);

-- Drop politics picks (category stays inactive for any leftover rows).
DELETE FROM user_interests
WHERE category_id = (SELECT id FROM categories WHERE slug = 'politics');
DELETE FROM guest_interests
WHERE category_id = (SELECT id FROM categories WHERE slug = 'politics');

UPDATE categories SET active = false
WHERE slug IN (
  'politics', 'weather', 'casual', 'entertainment', 'science', 'social', 'k-drama'
);

INSERT INTO categories (slug, name, sort_order, active) VALUES
  ('gaming', 'Gaming', 6, true),
  ('puzzles', 'Puzzles', 14, true),
  ('logical-reasoning', 'Logical Reasoning', 15, true),
  ('math-numbers', 'Math & Numbers', 16, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active;

UPDATE categories SET name = v.name, sort_order = v.sort_order, active = true
FROM (VALUES
  ('cricket', 'Cricket', 1),
  ('movies', 'Bollywood', 2),
  ('music', 'Music', 3),
  ('pop-culture', 'Memes & Pop Culture', 4),
  ('food', 'Food', 5),
  ('gaming', 'Gaming', 6),
  ('sports', 'Sports (Non-Cricket)', 7),
  ('news', 'News & Current Affairs', 8),
  ('tech', 'Technology', 9),
  ('personality-vibe', 'Personality & Quizzes', 10),
  ('fashion', 'Fashion & Beauty', 11),
  ('health', 'Health & Fitness', 12),
  ('kpop', 'K-Pop & K-Drama', 13),
  ('puzzles', 'Puzzles', 14),
  ('logical-reasoning', 'Logical Reasoning', 15),
  ('math-numbers', 'Math & Numbers', 16)
) AS v(slug, name, sort_order)
WHERE categories.slug = v.slug;
