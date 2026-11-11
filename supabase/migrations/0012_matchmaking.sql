-- Online Quick Match (M11) + live sync fields (M12).
-- Same-seed stranger duels; friend challenges stay in challenges.

CREATE TYPE matchmaking_ticket_status AS ENUM (
  'searching',
  'matched',
  'cancelled',
  'expired'
);

CREATE TYPE match_status AS ENUM (
  'ready',
  'playing',
  'completed',
  'cancelled',
  'forfeit',
  'expired'
);

CREATE TABLE matchmaking_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  game_key TEXT REFERENCES mini_games (key),
  status matchmaking_ticket_status NOT NULL DEFAULT 'searching',
  region TEXT,
  skill_bucket INT,
  preferred_opponent_id UUID REFERENCES users (id) ON DELETE SET NULL,
  match_id UUID,
  idempotency_key TEXT,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT matchmaking_tickets_self_pref_chk CHECK (
    preferred_opponent_id IS NULL OR preferred_opponent_id <> user_id
  )
);

CREATE UNIQUE INDEX matchmaking_tickets_idem_uidx
  ON matchmaking_tickets (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX matchmaking_tickets_one_searching_uidx
  ON matchmaking_tickets (user_id)
  WHERE status = 'searching';

CREATE INDEX matchmaking_tickets_search_idx
  ON matchmaking_tickets (status, game_key, created_at)
  WHERE status = 'searching';

CREATE INDEX matchmaking_tickets_expires_idx
  ON matchmaking_tickets (expires_at)
  WHERE status = 'searching';

CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_key TEXT NOT NULL REFERENCES mini_games (key),
  seed TEXT NOT NULL,
  status match_status NOT NULL DEFAULT 'ready',
  player_a_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  player_b_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  play_a_id UUID,
  play_b_id UUID,
  ticket_a_id UUID REFERENCES matchmaking_tickets (id) ON DELETE SET NULL,
  ticket_b_id UUID REFERENCES matchmaking_tickets (id) ON DELETE SET NULL,
  found_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at TIMESTAMPTZ,
  play_deadline_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rematch_of_id UUID REFERENCES matches (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT matches_distinct_players_chk CHECK (player_a_id <> player_b_id),
  CONSTRAINT matches_seed_chk CHECK (char_length(seed) >= 1 AND char_length(seed) <= 80)
);

ALTER TABLE matchmaking_tickets
  ADD CONSTRAINT matchmaking_tickets_match_fk
    FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE SET NULL;

CREATE INDEX matches_player_a_idx ON matches (player_a_id, created_at DESC);
CREATE INDEX matches_player_b_idx ON matches (player_b_id, created_at DESC);
CREATE INDEX matches_deadline_idx ON matches (play_deadline_at)
  WHERE status IN ('ready', 'playing');

ALTER TABLE game_plays
  ADD COLUMN match_id UUID REFERENCES matches (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX game_plays_match_user_uidx
  ON game_plays (match_id, user_id)
  WHERE match_id IS NOT NULL AND user_id IS NOT NULL;

ALTER TABLE matches
  ADD CONSTRAINT matches_play_a_fk
    FOREIGN KEY (play_a_id) REFERENCES game_plays (id) ON DELETE SET NULL,
  ADD CONSTRAINT matches_play_b_fk
    FOREIGN KEY (play_b_id) REFERENCES game_plays (id) ON DELETE SET NULL;

CREATE TABLE match_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX match_events_match_idx ON match_events (match_id, created_at);
