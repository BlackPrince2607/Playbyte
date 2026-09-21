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

export function scramble(word: string): string {
  const chars = word.split("");
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  const out = chars.join("");
  return out === word ? scramble(word) : out;
}
