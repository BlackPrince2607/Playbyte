-- Idempotent analytics ingestion and race-free Choice crowd tallies.
--
-- game_events.client_event_id: stable id the client assigns when it queues an event; retried
-- batches are deduplicated per session. Older clients send none (NULL) and are stored as before.
--
-- choice_votes: one preference vote per game session and pair. The primary key is the vote's
-- idempotency key, so replayed or duplicated picks never count twice. The displayed split in
-- content_items.attributes is updated only for newly inserted votes, under a row lock.
-- Apply after 0006. Additive; no backfill needed.

ALTER TABLE game_events ADD COLUMN IF NOT EXISTS client_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS game_events_session_client_event_uidx
  ON game_events (session_id, client_event_id)
  WHERE client_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS choice_votes (
  item_id text NOT NULL REFERENCES content_items (id) ON DELETE CASCADE,
  session_id text NOT NULL,
  vote text NOT NULL CONSTRAINT choice_votes_vote_check CHECK (vote IN ('a', 'b')),
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  guest_session_id uuid REFERENCES guest_sessions (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, session_id)
);

ALTER TABLE choice_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON choice_votes FROM anon, authenticated;
