/**
 * Retired legacy game keys mapped to the SDK definition that replaced them. A feed card that still
 * carries an old key (e.g. production rows not yet re-seeded) launches the new engine instead.
 * Add an entry here in the same change that ships the replacement engine. `maxScore` keeps the old
 * row's server-side cap so scores are not clamped unexpectedly.
 */
export const LEGACY_REPLACEMENTS: Record<string, Record<string, unknown>> = {
  flag_rush: { engine: "guess", variation: "flag", roundCount: 10, maxScore: 100 },
  emoji_decode: { engine: "emoji_guess", variation: "phrase", roundCount: 8, maxScore: 100 },
  odd_one_out: { engine: "odd_one_out", variation: "lookalike", roundCount: 5, maxScore: 20 },
  frenzy_tap: { engine: "tap", variation: "rush", maxScore: 2000 },
  traffic_light: { engine: "tap", variation: "reaction", maxScore: 1000 },
  grid_hunt: { engine: "word_search", variation: "classic", roundCount: 1, maxScore: 100 },
};
