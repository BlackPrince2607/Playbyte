INSERT INTO content_windows (slug, title, category_id, starts_at, ends_at, priority, status)
SELECT 'cricket-tonight', 'Cricket Tonight', id, now() - interval '1 hour', now() + interval '8 hours', 100, 'active'
FROM categories WHERE slug = 'cricket'
ON CONFLICT (slug) DO NOTHING;

-- Predict: Who wins tonight?
WITH cat AS (SELECT id FROM categories WHERE slug = 'cricket'),
     win AS (SELECT id FROM content_windows WHERE slug = 'cricket-tonight'),
     m AS (
       INSERT INTO moments (type, category_id, content_window_id, status, prompt, starts_at, ends_at)
       SELECT 'predict', cat.id, win.id, 'live', 'Who wins tonight?', now() - interval '10 minutes', now() + interval '6 hours'
       FROM cat, win
       RETURNING id
     )
INSERT INTO moment_options (moment_id, label, sort_order)
SELECT m.id, x.label, x.sort_order FROM m
CROSS JOIN (VALUES ('India', 0), ('Australia', 1)) AS x(label, sort_order);

-- Pulse: Best late-night food?
WITH cat AS (SELECT id FROM categories WHERE slug = 'food'),
     m AS (
       INSERT INTO moments (type, category_id, status, prompt, starts_at, ends_at)
       SELECT 'pulse', cat.id, 'live', 'Best late-night food?', now() - interval '20 minutes', now() + interval '12 hours'
       FROM cat
       RETURNING id
     )
INSERT INTO moment_options (moment_id, label, sort_order)
SELECT m.id, x.label, x.sort_order FROM m
CROSS JOIN (VALUES ('Maggi', 0), ('Pizza', 1), ('Paratha', 2)) AS x(label, sort_order);

-- Reaction: live binary
WITH cat AS (SELECT id FROM categories WHERE slug = 'sports'),
     m AS (
       INSERT INTO moments (type, category_id, status, prompt, starts_at, ends_at)
       SELECT 'reaction', cat.id, 'live', 'Is this over already?', now() - interval '5 minutes', now() + interval '2 hours'
       FROM cat
       RETURNING id
     )
INSERT INTO moment_options (moment_id, label, sort_order)
SELECT m.id, x.label, x.sort_order FROM m
CROSS JOIN (VALUES ('Yes', 0), ('No', 1)) AS x(label, sort_order);

INSERT INTO crowd_snapshots (moment_id, version, total_responses, option_counts, joined_last_minute, volume_state)
SELECT id, 1, 0, '{}'::jsonb, 0, 'nascent' FROM moments
ON CONFLICT (moment_id) DO NOTHING;

UPDATE moments SET prompt_hi = 'आज रात कौन जीतेगा?' WHERE prompt = 'Who wins tonight?' AND prompt_hi IS NULL;
UPDATE moments SET prompt_hi = 'देर रात का सबसे अच्छा खाना?' WHERE prompt = 'Best late-night food?' AND prompt_hi IS NULL;
UPDATE moments SET prompt_hi = 'क्या यह ओवर खत्म हो गया?' WHERE prompt = 'Is this over already?' AND prompt_hi IS NULL;

UPDATE moment_options SET label_hi = v.hi
FROM (VALUES
  ('India', 'भारत'),
  ('Australia', 'ऑस्ट्रेलिया'),
  ('Maggi', 'मैगी'),
  ('Pizza', 'पिज़्ज़ा'),
  ('Paratha', 'पराठा'),
  ('Yes', 'हाँ'),
  ('No', 'नहीं')
) AS v(en, hi)
WHERE moment_options.label = v.en AND moment_options.label_hi IS NULL;
