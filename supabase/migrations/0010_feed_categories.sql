-- Categories the feed generator stocks for onboarding picks.

INSERT INTO categories (slug, name, sort_order) VALUES
  ('personality-vibe', 'Personality & Vibe', 18),
  ('kpop', 'K-Pop', 19)
ON CONFLICT (slug) DO NOTHING;
