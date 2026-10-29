-- Coin wallet. Scores stay on game_plays; this ledger is the only balance.
-- Apply after 0009. Additive. Clients cannot read these tables (see 0006).

CREATE TABLE IF NOT EXISTS wallets (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallets_balance_chk CHECK (balance >= 0)
);

CREATE TABLE IF NOT EXISTS coin_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  delta integer NOT NULL,
  balance_after integer NOT NULL,
  reason text NOT NULL,
  ref_type text,
  ref_id text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coin_ledger_balance_chk CHECK (balance_after >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS coin_ledger_idempotency_uidx ON coin_ledger (idempotency_key);
CREATE INDEX IF NOT EXISTS coin_ledger_user_time_idx ON coin_ledger (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS economy_days (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day date NOT NULL,
  free_hints_used integer NOT NULL DEFAULT 0,
  games_rewarded integer NOT NULL DEFAULT 0,
  moments_rewarded integer NOT NULL DEFAULT 0,
  streak_claimed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, day),
  CONSTRAINT economy_days_hints_chk CHECK (free_hints_used >= 0),
  CONSTRAINT economy_days_games_chk CHECK (games_rewarded >= 0),
  CONSTRAINT economy_days_moments_chk CHECK (moments_rewarded >= 0)
);

CREATE TABLE IF NOT EXISTS user_streaks (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  current_count integer NOT NULL DEFAULT 0,
  best_count integer NOT NULL DEFAULT 0,
  last_active_date date,
  freezes integer NOT NULL DEFAULT 0,
  milestones integer[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_streaks_count_chk CHECK (current_count >= 0 AND best_count >= 0),
  CONSTRAINT user_streaks_freezes_chk CHECK (freezes >= 0 AND freezes <= 1)
);

CREATE TABLE IF NOT EXISTS iap_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  store text NOT NULL,
  store_transaction_id text NOT NULL,
  product_id text NOT NULL,
  coins integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iap_purchases_coins_chk CHECK (coins > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS iap_purchases_transaction_uidx ON iap_purchases (store_transaction_id);

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE economy_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE iap_purchases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON wallets, coin_ledger, economy_days, user_streaks, iap_purchases FROM anon, authenticated;
