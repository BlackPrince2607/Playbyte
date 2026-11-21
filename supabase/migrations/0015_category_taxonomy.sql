-- Hierarchical interest taxonomy: fewer top-level categories, content_format/content_type on moments.
-- Remaps legacy interest/moment FKs onto the new active slugs.

ALTER TABLE moments
  ADD COLUMN IF NOT EXISTS content_format text,
  ADD COLUMN IF NOT EXISTS content_type text;

-- Remap interests / moments / windows from legacy slug → new slug.
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

-- Insert new categories first so remaps have targets.
INSERT INTO categories (slug, name, sort_order, active) VALUES
  ('bollywood', 'Bollywood', 1, true),
  ('mythology', 'Mythology', 2, true),
  ('tv-serials', 'TV Serials', 3, true),
  ('cricket', 'Cricket', 4, true),
  ('indian-foods', 'Indian Foods', 5, true),
  ('football', 'Football', 6, true),
  ('general-knowledge', 'General Knowledge', 7, true),
  ('kpop', 'K-pop', 8, true),
  ('boys-girls', 'Boys & Girls', 9, true),
  ('math-puzzles', 'Math Puzzles', 10, true),
  ('memory-games', 'Memory Games', 11, true),
  ('word-puzzles', 'Word Puzzles', 12, true),
  ('maths', 'Maths', 13, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active;

SELECT _remap_category('movies', 'bollywood');
SELECT _remap_category('food', 'indian-foods');
SELECT _remap_category('sports', 'football');
SELECT _remap_category('personality-vibe', 'boys-girls');
SELECT _remap_category('math-numbers', 'maths');
SELECT _remap_category('puzzles', 'math-puzzles');
SELECT _remap_category('logical-reasoning', 'math-puzzles');
SELECT _remap_category('music', 'bollywood');
SELECT _remap_category('pop-culture', 'general-knowledge');
SELECT _remap_category('gaming', 'general-knowledge');
SELECT _remap_category('news', 'general-knowledge');
SELECT _remap_category('tech', 'general-knowledge');
SELECT _remap_category('fashion', 'bollywood');
SELECT _remap_category('health', 'general-knowledge');

DROP FUNCTION _remap_category(text, text);

-- Deactivate retired / remapped slugs (keep rows for any leftover FKs).
UPDATE categories SET active = false
WHERE slug IN (
  'movies', 'music', 'pop-culture', 'food', 'gaming', 'sports', 'news', 'tech',
  'personality-vibe', 'fashion', 'health', 'puzzles', 'logical-reasoning', 'math-numbers',
  'politics', 'weather', 'casual', 'entertainment', 'science', 'social', 'k-drama'
);

-- Ensure active set + names / sort order match taxonomy.
UPDATE categories SET name = v.name, sort_order = v.sort_order, active = true
FROM (VALUES
  ('bollywood', 'Bollywood', 1),
  ('mythology', 'Mythology', 2),
  ('tv-serials', 'TV Serials', 3),
  ('cricket', 'Cricket', 4),
  ('indian-foods', 'Indian Foods', 5),
  ('football', 'Football', 6),
  ('general-knowledge', 'General Knowledge', 7),
  ('kpop', 'K-pop', 8),
  ('boys-girls', 'Boys & Girls', 9),
  ('math-puzzles', 'Math Puzzles', 10),
  ('memory-games', 'Memory Games', 11),
  ('word-puzzles', 'Word Puzzles', 12),
  ('maths', 'Maths', 13)
) AS v(slug, name, sort_order)
WHERE categories.slug = v.slug;
