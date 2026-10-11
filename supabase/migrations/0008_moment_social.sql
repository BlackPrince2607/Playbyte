-- Likes, shares and comments on moments.
--
-- moment_likes / moment_shares: one row per actor (signed-in user or guest session) and moment, so
-- toggling and retried requests never double count. Exactly one of user_id / guest_session_id is set.
-- moment_comments: signed-in users only (comments need a display name). Deletes are soft
-- (status = 'deleted') so reports keep pointing at a row; moderators hide with status = 'hidden'.
-- Apply after 0007. Additive; no backfill needed.

CREATE TABLE IF NOT EXISTS moment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id uuid NOT NULL REFERENCES moments (id) ON DELETE CASCADE,
  user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  guest_session_id uuid REFERENCES guest_sessions (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moment_likes_one_actor CHECK ((user_id IS NULL) <> (guest_session_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS moment_likes_user_uidx
  ON moment_likes (moment_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS moment_likes_guest_uidx
  ON moment_likes (moment_id, guest_session_id) WHERE guest_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS moment_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id uuid NOT NULL REFERENCES moments (id) ON DELETE CASCADE,
  user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  guest_session_id uuid REFERENCES guest_sessions (id) ON DELETE CASCADE,
  channel text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moment_shares_one_actor CHECK ((user_id IS NULL) <> (guest_session_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS moment_shares_user_uidx
  ON moment_shares (moment_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS moment_shares_guest_uidx
  ON moment_shares (moment_id, guest_session_id) WHERE guest_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS moment_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id uuid NOT NULL REFERENCES moments (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body text NOT NULL CONSTRAINT moment_comments_body_len CHECK (char_length(body) BETWEEN 1 AND 280),
  status text NOT NULL DEFAULT 'visible' CONSTRAINT moment_comments_status_check
    CHECK (status IN ('visible', 'hidden', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moment_comments_moment_idx
  ON moment_comments (moment_id, created_at DESC, id DESC) WHERE status = 'visible';

ALTER TABLE moment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE moment_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE moment_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON moment_likes, moment_shares, moment_comments FROM anon, authenticated;
