-- Playbyte initial schema (Architecture §7 + hybrid feed additive tables)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_status AS ENUM ('active', 'disabled', 'deleted');
CREATE TYPE actor_visibility AS ENUM ('public', 'friends', 'private');
CREATE TYPE moment_type AS ENUM ('predict', 'pulse', 'reaction');
CREATE TYPE moment_status AS ENUM ('draft', 'scheduled', 'ready', 'live', 'closed', 'retired');
CREATE TYPE restricted_topic AS ENUM ('none', 'health', 'tragedy', 'election');
CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'blocked');
CREATE TYPE game_status AS ENUM ('enabled', 'disabled');
CREATE TYPE window_status AS ENUM ('draft', 'active', 'ended');
CREATE TYPE outbox_status AS ENUM ('pending', 'processing', 'done', 'dead');
CREATE TYPE report_status AS ENUM ('open', 'reviewed', 'actioned', 'dismissed');
CREATE TYPE data_request_type AS ENUM ('export', 'deletion');
CREATE TYPE data_request_status AS ENUM ('queued', 'processing', 'complete', 'failed');
CREATE TYPE approval_decision AS ENUM ('approve', 'reject');
CREATE TYPE volume_state AS ENUM ('nascent', 'building', 'mature');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject TEXT UNIQUE,
  status user_status NOT NULL DEFAULT 'active',
  date_of_birth DATE,
  age_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE guest_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  moments_responded_count INTEGER NOT NULL DEFAULT 0,
  games_played_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  converted_user_id UUID REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX guest_sessions_expires_idx ON guest_sessions (expires_at);

CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Player',
  avatar_key TEXT,
  bio TEXT,
  default_visibility actor_visibility NOT NULL DEFAULT 'friends',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE user_interests (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, category_id)
);

CREATE TABLE guest_interests (
  guest_session_id UUID NOT NULL REFERENCES guest_sessions (id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  PRIMARY KEY (guest_session_id, category_id)
);

CREATE TABLE content_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category_id UUID REFERENCES categories (id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  status window_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type moment_type NOT NULL,
  category_id UUID NOT NULL REFERENCES categories (id),
  content_window_id UUID REFERENCES content_windows (id),
  status moment_status NOT NULL DEFAULT 'draft',
  restricted_topic restricted_topic NOT NULL DEFAULT 'none',
  prompt TEXT NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT moments_window_chk CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX moments_status_time_idx ON moments (status, starts_at, ends_at);
CREATE INDEX moments_category_idx ON moments (category_id);
CREATE INDEX moments_window_idx ON moments (content_window_id);

CREATE TABLE moment_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES moments (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  UNIQUE (moment_id, sort_order)
);

CREATE TABLE responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES moments (id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES moment_options (id),
  user_id UUID REFERENCES users (id),
  guest_session_id UUID REFERENCES guest_sessions (id),
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT responses_actor_chk CHECK (
    (user_id IS NOT NULL AND guest_session_id IS NULL)
    OR (user_id IS NULL AND guest_session_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX responses_user_moment_uidx ON responses (moment_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX responses_guest_moment_uidx ON responses (moment_id, guest_session_id) WHERE guest_session_id IS NOT NULL;
CREATE UNIQUE INDEX responses_idem_user_uidx ON responses (moment_id, user_id, idempotency_key) WHERE user_id IS NOT NULL AND idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX responses_idem_guest_uidx ON responses (moment_id, guest_session_id, idempotency_key) WHERE guest_session_id IS NOT NULL AND idempotency_key IS NOT NULL;
CREATE INDEX responses_moment_time_idx ON responses (moment_id, created_at);

CREATE TABLE crowd_snapshots (
  moment_id UUID PRIMARY KEY REFERENCES moments (id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 0,
  total_responses INTEGER NOT NULL DEFAULT 0,
  option_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  joined_last_minute INTEGER NOT NULL DEFAULT 0,
  volume_state volume_state NOT NULL DEFAULT 'nascent',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status friendship_status NOT NULL DEFAULT 'pending',
  requested_by UUID NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT friendships_order_chk CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);

CREATE TABLE response_visibility (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  moment_id UUID NOT NULL REFERENCES moments (id) ON DELETE CASCADE,
  visibility actor_visibility NOT NULL,
  PRIMARY KEY (user_id, moment_id)
);

CREATE TABLE moment_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES moments (id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES users (id),
  decision approval_decision NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mini_games (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  blurb TEXT NOT NULL,
  status game_status NOT NULL DEFAULT 'enabled',
  sort_order INTEGER NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE game_plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_key TEXT NOT NULL REFERENCES mini_games (key),
  user_id UUID REFERENCES users (id),
  guest_session_id UUID REFERENCES guest_sessions (id),
  score INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT game_plays_actor_chk CHECK (
    (user_id IS NOT NULL AND guest_session_id IS NULL)
    OR (user_id IS NULL AND guest_session_id IS NOT NULL)
  ),
  CONSTRAINT game_plays_score_chk CHECK (score >= 0 AND score <= 1000000),
  CONSTRAINT game_plays_duration_chk CHECK (duration_ms >= 0 AND duration_ms <= 300000)
);
CREATE INDEX game_plays_key_time_idx ON game_plays (game_key, created_at);
CREATE UNIQUE INDEX game_plays_idem_user_uidx ON game_plays (game_key, user_id, idempotency_key) WHERE user_id IS NOT NULL AND idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX game_plays_idem_guest_uidx ON game_plays (game_key, guest_session_id, idempotency_key) WHERE guest_session_id IS NOT NULL AND idempotency_key IS NOT NULL;

CREATE TABLE share_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID REFERENCES moments (id),
  game_key TEXT REFERENCES mini_games (key),
  user_id UUID REFERENCES users (id),
  guest_session_id UUID REFERENCES guest_sessions (id),
  asset_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID REFERENCES users (id),
  reporter_guest_id UUID REFERENCES guest_sessions (id),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT,
  status report_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reports_status_idx ON reports (status, created_at);

CREATE TABLE moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users (id),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status outbox_status NOT NULL DEFAULT 'pending',
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending_idx ON outbox_events (status, next_attempt_at);

CREATE TABLE push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  live_now BOOLEAN NOT NULL DEFAULT TRUE,
  trending BOOLEAN NOT NULL DEFAULT TRUE,
  friend_activity BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  UNIQUE (user_id, event_key)
);
CREATE INDEX notification_deliveries_daily_idx ON notification_deliveries (user_id, sent_at);

CREATE TABLE user_daily_stats (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  date DATE NOT NULL,
  moments_joined INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  majority_matches INTEGER NOT NULL DEFAULT 0,
  unique_people INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE data_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type data_request_type NOT NULL,
  status data_request_status NOT NULL DEFAULT 'queued',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  download_key TEXT
);
CREATE INDEX data_requests_type_status_idx ON data_requests (type, status);

CREATE TABLE consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_users (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor'
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_actor_time_idx ON audit_logs (actor_id, created_at);
CREATE INDEX audit_logs_resource_idx ON audit_logs (resource, resource_id);
