-- Async score-duel challenges between friends (shared seed, compare plays).

CREATE TYPE challenge_status AS ENUM (
  'pending',
  'active',
  'completed',
  'declined',
  'expired'
);

CREATE TABLE challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  opponent_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  game_key TEXT NOT NULL REFERENCES mini_games (key),
  moment_id UUID REFERENCES moments (id) ON DELETE SET NULL,
  seed TEXT NOT NULL,
  status challenge_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  challenger_play_id UUID,
  opponent_play_id UUID,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT challenges_distinct_players_chk CHECK (challenger_id <> opponent_id),
  CONSTRAINT challenges_seed_chk CHECK (char_length(seed) >= 1 AND char_length(seed) <= 80)
);

CREATE UNIQUE INDEX challenges_idem_challenger_uidx
  ON challenges (challenger_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX challenges_opponent_status_idx ON challenges (opponent_id, status);
CREATE INDEX challenges_challenger_status_idx ON challenges (challenger_id, status);
CREATE INDEX challenges_expires_idx ON challenges (expires_at)
  WHERE status IN ('pending', 'active');

ALTER TABLE game_plays
  ADD COLUMN challenge_id UUID REFERENCES challenges (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX game_plays_challenge_user_uidx
  ON game_plays (challenge_id, user_id)
  WHERE challenge_id IS NOT NULL AND user_id IS NOT NULL;

ALTER TABLE challenges
  ADD CONSTRAINT challenges_challenger_play_fk
    FOREIGN KEY (challenger_play_id) REFERENCES game_plays (id) ON DELETE SET NULL,
  ADD CONSTRAINT challenges_opponent_play_fk
    FOREIGN KEY (opponent_play_id) REFERENCES game_plays (id) ON DELETE SET NULL;
