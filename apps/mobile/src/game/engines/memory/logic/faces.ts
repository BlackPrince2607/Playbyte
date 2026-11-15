/** Themed emoji faces for Find the Pair. Four faces are sampled per board. */
export const FACE_THEMES: Record<string, readonly string[]> = {
  animals: ["🦊", "🐼", "🦁", "🐸", "🦄", "🐙", "🐝", "🐧"],
  food: ["🍕", "🍔", "🍣", "🍩", "🌮", "🍦", "🍉", "🥐"],
  sports: ["⚽", "🏀", "🎾", "🏏", "🏐", "🥊", "⛳", "🏒"],
  faces: ["😎", "🤩", "🥳", "😈", "🤖", "👻", "👽", "🎃"],
};

export const THEME_IDS = Object.keys(FACE_THEMES);

export const PAIR_COUNT = 4;
export const CARD_COUNT = PAIR_COUNT * 2;
export const FLIP_BACK_MS = 550;
export const DEFAULT_LIMIT_MS = 45_000;
export const MATCH_POINTS = 80;
export const STREAK_STEP = 20;
export const STREAK_CAP = 60;
export const TIME_BONUS = 120;
export const MISMATCH_PENALTY = 8;
