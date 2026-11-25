/**
 * Bundled fallback packs (JSON + local `asset:spot/` art for spot_pair) so games work on first launch.
 * Loaded lazily; the same JSON files seed the backend via backend/scripts/import_content.py.
 *
 * Hindi-native packs live under `./hi/` (locale hi-IN). English packs stay at this folder root.
 */
type PackModule = { items?: unknown; default?: { items?: unknown } };
const items = (m: PackModule) => (m.default ?? m).items;

export const FALLBACK_PACKS: Record<string, () => Promise<unknown>> = {
  flag: () => import("./flag.json").then(items),
  indian_state: () => import("./indian_state.json").then(items),
  food: () => import("./food.json").then(items),
  landmark: () => import("./landmark.json").then(items),
  emoji_movie: () => import("./emoji_movie.json").then(items),
  emoji_phrase: () => import("./emoji_phrase.json").then(items),
  emoji_word: () => import("./emoji_word.json").then(items),
  emoji_song: () => import("./emoji_song.json").then(items),
  word_group: () => import("./word_group.json").then(items),
  fact: () => import("./fact.json").then(items),
  choice_pair: () => import("./choice_pair.json").then(items),
  spot_pair: () => import("./spot_pair.json").then(items),
};

/** Hindi-native seeds — used when app language is Hindi and remote hi-IN is missing. */
export const FALLBACK_PACKS_HI: Record<string, () => Promise<unknown>> = {
  flag: () => import("./hi/flag.json").then(items),
  indian_state: () => import("./hi/indian_state.json").then(items),
  food: () => import("./hi/food.json").then(items),
  landmark: () => import("./hi/landmark.json").then(items),
  emoji_movie: () => import("./hi/emoji_movie.json").then(items),
  emoji_phrase: () => import("./hi/emoji_phrase.json").then(items),
  emoji_word: () => import("./hi/emoji_word.json").then(items),
  emoji_song: () => import("./hi/emoji_song.json").then(items),
  word_group: () => import("./hi/word_group.json").then(items),
  fact: () => import("./hi/fact.json").then(items),
  choice_pair: () => import("./hi/choice_pair.json").then(items),
  spot_pair: () => import("./hi/spot_pair.json").then(items),
};
