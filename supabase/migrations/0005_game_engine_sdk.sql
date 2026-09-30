-- Game Engine SDK: engine-driven catalog, play metadata, remote content packs, game analytics.
-- Additive only: existing clients keep working.

ALTER TABLE mini_games
  ADD COLUMN IF NOT EXISTS engine text,
  ADD COLUMN IF NOT EXISTS variation text,
  ADD COLUMN IF NOT EXISTS config_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS score_direction text NOT NULL DEFAULT 'higher_is_better';

ALTER TABLE mini_games DROP CONSTRAINT IF EXISTS mini_games_score_direction_chk;
ALTER TABLE mini_games
  ADD CONSTRAINT mini_games_score_direction_chk
  CHECK (score_direction IN ('higher_is_better', 'lower_is_better'));

ALTER TABLE game_plays
  ADD COLUMN IF NOT EXISTS engine text,
  ADD COLUMN IF NOT EXISTS variation text,
  ADD COLUMN IF NOT EXISTS seed text,
  ADD COLUMN IF NOT EXISTS engine_version integer,
  ADD COLUMN IF NOT EXISTS config_version integer,
  ADD COLUMN IF NOT EXISTS summary jsonb;

CREATE INDEX IF NOT EXISTS game_plays_game_created_idx ON game_plays (game_key, created_at DESC);

-- Engine-independent content items (one movie can feed Guess, Emoji Guess, Fact/Fake, Choice).
CREATE TABLE IF NOT EXISTS content_items (
  id text PRIMARY KEY,
  type text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  locale text NOT NULL DEFAULT 'en-IN',
  categories text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  difficulty real NOT NULL DEFAULT 0.5 CHECK (difficulty >= 0 AND difficulty <= 1),
  popularity real NOT NULL DEFAULT 0.5 CHECK (popularity >= 0 AND popularity <= 1),
  answer text,
  aliases text[] NOT NULL DEFAULT '{}',
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  hints text[] NOT NULL DEFAULT '{}',
  distractor_group text,
  source jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_items_type_status_idx ON content_items (type, status);
CREATE INDEX IF NOT EXISTS content_items_categories_idx ON content_items USING gin (categories);

-- Named packs. A pack id without a row resolves to "all approved items of type = pack id".
CREATE TABLE IF NOT EXISTS content_packs (
  id text PRIMARY KEY,
  title text NOT NULL,
  types text[] NOT NULL,
  categories text[] NOT NULL DEFAULT '{}',
  locale text,
  max_items integer NOT NULL DEFAULT 500 CHECK (max_items BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Batched gameplay analytics from the client EventBus HTTP sink.
CREATE TABLE IF NOT EXISTS game_events (
  id bigserial PRIMARY KEY,
  type text NOT NULL,
  name text,
  session_id text NOT NULL,
  game_key text NOT NULL,
  engine text,
  engine_version integer,
  variation text,
  round integer,
  seed text,
  clock_ms integer,
  props jsonb,
  client_ts timestamptz,
  app_version text,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  guest_session_id uuid REFERENCES guest_sessions (id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_events_game_received_idx ON game_events (game_key, received_at DESC);
CREATE INDEX IF NOT EXISTS game_events_session_idx ON game_events (session_id);
