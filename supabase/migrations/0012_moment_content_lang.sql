-- Separate EN / HI content pools. Hindi-native cards invent their own prompts;
-- they are not localizations of English siblings.
ALTER TABLE moments
  ADD COLUMN IF NOT EXISTS content_lang text NOT NULL DEFAULT 'en';

ALTER TABLE moments
  DROP CONSTRAINT IF EXISTS moments_content_lang_check;

ALTER TABLE moments
  ADD CONSTRAINT moments_content_lang_check CHECK (content_lang IN ('en', 'hi'));

CREATE INDEX IF NOT EXISTS moments_content_lang_status_idx
  ON moments (content_lang, status);
