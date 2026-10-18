-- Optional Hindi copy for live moments. English stays the source of truth when these are null.
ALTER TABLE moments ADD COLUMN IF NOT EXISTS prompt_hi text;
ALTER TABLE moment_options ADD COLUMN IF NOT EXISTS label_hi text;

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
