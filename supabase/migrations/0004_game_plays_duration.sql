-- Allow longer open game sessions (safety max: 2 hours).
ALTER TABLE game_plays DROP CONSTRAINT IF EXISTS game_plays_duration_chk;
ALTER TABLE game_plays
  ADD CONSTRAINT game_plays_duration_chk
  CHECK (duration_ms >= 0 AND duration_ms <= 7200000);
