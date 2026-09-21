-- Content tags, media on moments/options, quiz scoring, expanded categories

CREATE TYPE scoring_mode AS ENUM ('none', 'correct_option');

CREATE TABLE content_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE moment_tags (
  moment_id UUID NOT NULL REFERENCES moments (id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES content_tags (id) ON DELETE CASCADE,
  PRIMARY KEY (moment_id, tag_id)
);
CREATE INDEX moment_tags_tag_idx ON moment_tags (tag_id);

ALTER TABLE moments
  ADD COLUMN prompt_image_key TEXT,
  ADD COLUMN scoring_mode scoring_mode NOT NULL DEFAULT 'none';

ALTER TABLE moment_options
  ALTER COLUMN label DROP NOT NULL,
  ADD COLUMN image_key TEXT,
  ADD COLUMN is_correct BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE moment_options
  ADD CONSTRAINT moment_options_content_chk CHECK (
    (label IS NOT NULL AND btrim(label) <> '') OR image_key IS NOT NULL
  );

INSERT INTO content_tags (slug, name, sort_order) VALUES
  ('quiz', 'Quiz', 1),
  ('poll', 'Poll', 2),
  ('game', 'Game', 3)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (slug, name, sort_order) VALUES
  ('entertainment', 'Entertainment', 12),
  ('fashion', 'Fashion', 13),
  ('politics', 'Politics', 14),
  ('science', 'Science', 15),
  ('health', 'Health', 16),
  ('k-drama', 'K-Drama', 17)
ON CONFLICT (slug) DO NOTHING;
