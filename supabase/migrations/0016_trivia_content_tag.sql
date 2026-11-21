-- Knowledge moments use the feed-facing "trivia" badge (design + ranking copy).
-- Keep legacy "quiz" tag row for older clients; remap moment links onto trivia.

INSERT INTO content_tags (slug, name, sort_order) VALUES
  ('trivia', 'Trivia', 1)
ON CONFLICT (slug) DO NOTHING;

UPDATE content_tags SET sort_order = 2 WHERE slug = 'quiz' AND sort_order = 1;
UPDATE content_tags SET sort_order = 3 WHERE slug = 'poll' AND sort_order = 2;
UPDATE content_tags SET sort_order = 4 WHERE slug = 'game' AND sort_order = 3;

-- Point moment_tags that used quiz at trivia (skip if already tagged trivia).
UPDATE moment_tags mt
SET tag_id = trivia.id
FROM content_tags quiz, content_tags trivia
WHERE mt.tag_id = quiz.id
  AND quiz.slug = 'quiz'
  AND trivia.slug = 'trivia'
  AND NOT EXISTS (
    SELECT 1
    FROM moment_tags x
    WHERE x.moment_id = mt.moment_id
      AND x.tag_id = trivia.id
  );

DELETE FROM moment_tags mt
USING content_tags quiz
WHERE mt.tag_id = quiz.id
  AND quiz.slug = 'quiz';
