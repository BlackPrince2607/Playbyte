/**
 * Seeded PRNG (xmur3 string hash + mulberry32). Every generator and engine takes an Rng instead of
 * calling Math.random(), so a (seed, config, actions) triple always reproduces the same game.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  /** k distinct items (or all, if fewer). */
  sample<T>(items: readonly T[], k: number): T[];
  /** Independent child stream; the same label always yields the same stream. */
  fork(label: string): Rng;
  readonly seed: string;
}

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: string): Rng {
  const next = mulberry32(xmur3(seed)());
  const rng: Rng = {
    seed,
    next,
    int(min, max) {
      if (max < min) throw new RangeError(`int(${min}, ${max})`);
      return min + Math.floor(next() * (max - min + 1));
    },
    chance(p) {
      return next() < p;
    },
    pick(items) {
      if (!items.length) throw new RangeError("pick from empty list");
      return items[Math.floor(next() * items.length)];
    },
    shuffle(items) {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    sample(items, k) {
      return rng.shuffle(items).slice(0, Math.max(0, k));
    },
    fork(label) {
      return createRng(`${seed}/${label}`);
    },
  };
  return rng;
}

/** Non-deterministic seed for new sessions; everything downstream is deterministic from it. */
export function randomSeed(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
