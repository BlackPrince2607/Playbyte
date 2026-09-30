/**
 * Bundled fallback packs (text/emoji only, ≤300 KB total) so games work offline and on first launch.
 * Loaded lazily; the same JSON files seed the backend via backend/scripts/import_content.py.
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
  word_group: () => import("./word_group.json").then(items),
  fact: () => import("./fact.json").then(items),
  choice_pair: () => import("./choice_pair.json").then(items),
};
