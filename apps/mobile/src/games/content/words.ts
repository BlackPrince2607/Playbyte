/** Scramble / Word Blitz banks — common 5-letter English words. */
export const FIVE_LETTER_WORDS = [
  "APPLE", "BRAVE", "CANDY", "DREAM", "EAGLE", "FLAME", "GRAPE", "HAPPY", "IVORY", "JOKER",
  "KNIFE", "LEMON", "MAGIC", "NIGHT", "OCEAN", "PIANO", "QUEEN", "RIVER", "STORM", "TIGER",
  "ULTRA", "VIVID", "WHEAT", "XENON", "YOUTH", "ZEBRA", "BLEND", "CRISP", "DRIFT", "EMBER",
  "FROST", "GLOWY", "HONEY", "INPUT", "JUMBO", "KARMA", "LUNAR", "MIRTH", "NOVEL", "ORBIT",
  "PRISM", "QUIRK", "ROAST", "SPARK", "TRUTH", "UNITY", "VALOR", "WALTZ", "YACHT", "ZONAL",
  "AMBER", "BLOOM", "CLOUD", "DELTA", "EPOCH", "FLINT", "GHOST", "HAVEN", "INDEX", "JEWEL",
  "KNEEL", "LODGE", "MAPLE", "NORTH", "OLIVE", "PEACH", "QUILT", "RIDGE", "SHINE", "TRACE",
  "URBAN", "VISTA", "WHIRL", "YEAST", "ALIVE", "BEACH", "CHARM", "DANCE", "EARTH", "FIELD",
];

export function pickWord(exclude?: string): string {
  const pool = exclude ? FIVE_LETTER_WORDS.filter((w) => w !== exclude) : FIVE_LETTER_WORDS;
  return pool[Math.floor(Math.random() * pool.length)] ?? "PLAYS";
}

export function scramble(word: string, attempts = 12): string {
  if (word.length < 2) return word;
  for (let n = 0; n < attempts; n++) {
    const chars = word.split("");
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const out = chars.join("");
    if (out !== word) return out;
  }
  // Guaranteed different when ≥2 distinct chars; otherwise return as-is.
  if (new Set(word).size < 2) return word;
  const chars = word.split("");
  [chars[0], chars[1]] = [chars[1], chars[0]];
  return chars.join("");
}
