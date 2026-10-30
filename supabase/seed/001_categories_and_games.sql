INSERT INTO categories (slug, name, sort_order, active) VALUES
  ('cricket', 'Cricket', 1, true),
  ('movies', 'Bollywood', 2, true),
  ('music', 'Music', 3, true),
  ('pop-culture', 'Memes & Pop Culture', 4, true),
  ('food', 'Food', 5, true),
  ('gaming', 'Gaming', 6, true),
  ('sports', 'Sports (Non-Cricket)', 7, true),
  ('news', 'News & Current Affairs', 8, true),
  ('tech', 'Technology', 9, true),
  ('personality-vibe', 'Personality & Quizzes', 10, true),
  ('fashion', 'Fashion & Beauty', 11, true),
  ('health', 'Health & Fitness', 12, true),
  ('kpop', 'K-Pop & K-Drama', 13, true),
  ('puzzles', 'Puzzles', 14, true),
  ('logical-reasoning', 'Logical Reasoning', 15, true),
  ('math-numbers', 'Math & Numbers', 16, true),
  -- Legacy / merged — kept inactive so old content FKs stay valid.
  ('weather', 'Weather', 90, false),
  ('casual', 'Casual', 91, false),
  ('entertainment', 'Entertainment', 92, false),
  ('politics', 'Politics', 93, false),
  ('science', 'Science', 94, false),
  ('social', 'Social', 95, false),
  ('k-drama', 'K-Drama', 96, false)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active;

INSERT INTO content_tags (slug, name, sort_order) VALUES
  ('quiz', 'Quiz', 1),
  ('poll', 'Poll', 2),
  ('game', 'Game', 3)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO mini_games (key, title, blurb, status, sort_order, config) VALUES
  ('higher_or_lower', 'Higher or Lower', 'Guess if the next number is higher or lower. Play until you End.', 'enabled', 1, '{"maxScore": 50, "genre": "puzzle", "tag": "PUZZLE", "mode": "endless"}'),
  ('memory_sequence', 'Memory Sequence', 'Watch the sequence and tap it back.', 'enabled', 2, '{"maxScore": 40, "genre": "puzzle", "tag": "PUZZLE", "mode": "finite"}'),
  ('traffic_light', 'Traffic Light', 'Tap as soon as it turns green.', 'enabled', 3, '{"maxScore": 1000, "genre": "arcade", "tag": "ARCADE", "mode": "finite"}'),
  ('timer_stop', 'Timer Stop', 'Stop the clock as close to 9.999s as you can.', 'enabled', 4, '{"maxScore": 1000, "genre": "puzzle", "tag": "PUZZLE", "mode": "finite", "targetMs": 9999}'),
  ('color_match', 'Color Match', 'Does the word match the ink color?', 'enabled', 5, '{"maxScore": 40, "genre": "puzzle", "tag": "PUZZLE", "mode": "finite", "questions": 4}'),
  ('frenzy_tap', 'Frenzy Tap', 'Tap as much as you want — End when ready.', 'enabled', 6, '{"maxScore": 2000, "genre": "arcade", "tag": "ARCADE", "mode": "endless"}'),
  ('odd_one_out', 'Odd One Out', 'Find the shape that does not belong.', 'enabled', 7, '{"maxScore": 20, "genre": "puzzle", "tag": "PUZZLE", "mode": "finite"}'),
  ('perfect_circle', 'Perfect Circle', 'Draw the roundest circle you can.', 'enabled', 8, '{"maxScore": 100, "genre": "puzzle", "tag": "PUZZLE", "mode": "finite"}'),
  ('bubble_burst', 'Bubble Burst', 'Pop matching bubble groups. Play until you End.', 'enabled', 9, '{"maxScore": 1000000, "genre": "arcade", "tag": "ARCADE", "mode": "endless"}'),
  ('lane_dash', 'Lane Dash', 'Dodge obstacles in three lanes. Crash and retry until End.', 'enabled', 10, '{"maxScore": 1000000, "genre": "arcade", "tag": "ARCADE", "mode": "endless"}'),
  ('triple_match', 'Triple Match', 'Pick three matching tiles. Keep matching until End.', 'enabled', 11, '{"maxScore": 1000000, "genre": "puzzle", "tag": "PUZZLE", "mode": "endless"}'),
  ('flag_rush', 'Flag Rush', 'Name the flags — 10 questions then done.', 'enabled', 12, '{"maxScore": 100, "genre": "trivia", "tag": "TRIVIA", "mode": "finite", "questions": 10}'),
  ('emoji_decode', 'Emoji Decode', 'Decode emoji puzzles — 5 rounds then done.', 'enabled', 13, '{"maxScore": 100, "genre": "word", "tag": "WORD", "mode": "finite", "levels": 5}'),
  ('word_scramble', 'Word Scramble', 'Unscramble words forever. End anytime.', 'enabled', 14, '{"maxScore": 1000000, "genre": "word", "tag": "WORD", "mode": "endless"}'),
  ('word_blitz', 'Word Blitz', 'Guess the 5-letter word in six tries.', 'enabled', 15, '{"maxScore": 120, "genre": "word", "tag": "WORD", "mode": "finite"}'),
  ('grid_hunt', 'Grid Hunt', 'Find the hidden words in a letter grid.', 'enabled', 16, '{"maxScore": 100, "genre": "word", "tag": "WORD", "mode": "finite", "wordsToFind": 2}')
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  blurb = EXCLUDED.blurb,
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order,
  config = EXCLUDED.config;
