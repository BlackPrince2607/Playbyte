import type { Rng } from "../../../core/rng";

export type DiffKind = "missing" | "color" | "size" | "move" | "rotate" | "shape";

/** A difference and its hit box: centre (x, y) and half-extents (hw, hh), normalised coordinates. */
export type Difference = { id: string; kind: DiffKind; x: number; y: number; hw: number; hh: number; side: "left" | "right" };

export const inRegion = (d: Difference, x: number, y: number, slop = 0) => Math.abs(x - d.x) <= d.hw + slop && Math.abs(y - d.y) <= d.hh + slop;

export type SpotParams = {
  diffCount: number;
  /** Kept for difficulty-model compatibility; unused for photo pairs. */
  shapeCount: number;
  /** 0 = prefer large/obvious regions, 1 = prefer smaller ones. */
  subtlety: number;
  minSize: number;
  timeLimitMs: number;
};

/** Hit boxes are never smaller than this half-size (touch target on a ~360pt wide image). */
export const MIN_REGION = 0.05;

const area = (d: Difference) => 4 * d.hw * d.hh;

/**
 * Picks `diffCount` authored regions from a pair, biased by difficulty:
 * easy → larger boxes first; hard → smaller boxes first.
 */
export function selectDiffs(all: Difference[], p: SpotParams, rng: Rng): Difference[] {
  if (!all.length) return [];
  const want = Math.max(1, Math.min(p.diffCount, all.length));
  const scored = all
    .filter((d) => Math.min(d.hw, d.hh) >= p.minSize * 0.5)
    .map((d) => {
      const sizeRank = area(d);
      // subtlety 0 → favour large; 1 → favour small. Noise keeps rounds varied.
      const score = (1 - p.subtlety) * sizeRank + p.subtlety * (1 / (sizeRank + 1e-6)) + rng.next() * 0.15;
      return { d, score };
    })
    .sort((a, b) => b.score - a.score);
  const pool = scored.length ? scored : all.map((d) => ({ d, score: rng.next() }));
  return pool.slice(0, want).map((x) => x.d);
}
