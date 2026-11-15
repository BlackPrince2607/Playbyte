-- Bot opponents for cold Quick Match queues (fill after ~5s).
-- Client APIs never expose is_bot / opponent_is_bot.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS users_is_bot_idx ON users (id) WHERE is_bot;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS opponent_is_bot BOOLEAN NOT NULL DEFAULT false;

-- Seed a pool of bot identities (idempotent on auth_subject).
WITH seed(auth_subject, display_name) AS (
  VALUES
    ('bot:pool:01', 'Aarav'),
    ('bot:pool:02', 'Mia'),
    ('bot:pool:03', 'Kabir'),
    ('bot:pool:04', 'Sofia'),
    ('bot:pool:05', 'Rohan'),
    ('bot:pool:06', 'Elena'),
    ('bot:pool:07', 'Vihaan'),
    ('bot:pool:08', 'Nora'),
    ('bot:pool:09', 'Arjun'),
    ('bot:pool:10', 'Lila'),
    ('bot:pool:11', 'Dev'),
    ('bot:pool:12', 'Amelia'),
    ('bot:pool:13', 'Ishaan'),
    ('bot:pool:14', 'Zara'),
    ('bot:pool:15', 'Neil'),
    ('bot:pool:16', 'Priya'),
    ('bot:pool:17', 'Omar'),
    ('bot:pool:18', 'Anya'),
    ('bot:pool:19', 'Leo'),
    ('bot:pool:20', 'Meera'),
    ('bot:pool:21', 'Sam'),
    ('bot:pool:22', 'Isha'),
    ('bot:pool:23', 'Jay'),
    ('bot:pool:24', 'Tara'),
    ('bot:pool:25', 'Rex'),
    ('bot:pool:26', 'Nina'),
    ('bot:pool:27', 'Kian'),
    ('bot:pool:28', 'Ava'),
    ('bot:pool:29', 'Ravi'),
    ('bot:pool:30', 'Maya'),
    ('bot:pool:31', 'Finn'),
    ('bot:pool:32', 'Diya')
),
ins AS (
  INSERT INTO users (auth_subject, status, age_verified, is_bot)
  SELECT s.auth_subject, 'active', true, true
  FROM seed s
  WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.auth_subject = s.auth_subject
  )
  RETURNING id, auth_subject
)
INSERT INTO profiles (user_id, display_name, default_visibility)
SELECT i.id, s.display_name, 'friends'
FROM ins i
JOIN seed s ON s.auth_subject = i.auth_subject
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.user_id = i.id
);
