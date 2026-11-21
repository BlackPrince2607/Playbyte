-- Category queues for Quick Match: players search by theme; match picks a concrete game.

ALTER TABLE matchmaking_tickets
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS matchmaking_tickets_category_idx
  ON matchmaking_tickets (status, category, created_at)
  WHERE status = 'searching' AND category IS NOT NULL;
