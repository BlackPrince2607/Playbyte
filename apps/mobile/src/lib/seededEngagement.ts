import type { CrowdSnapshot, FeedMoment } from "../api";

export const SEED_MIN = 10;
export const SEED_MAX = 200;

export type EngagementKind = "responses" | "likes" | "shares" | "votes";

function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const unit = (seed: string) => hash(seed) / 0x1_0000_0000;

/** Placeholder engagement until real traffic exists; stable per id so numbers don't jump between renders. */
export function seededCount(id: string, kind: EngagementKind): number {
  return SEED_MIN + Math.floor(unit(`${id}:${kind}`) * (SEED_MAX - SEED_MIN + 1));
}

/** Real crowd plus a seeded baseline spread across the options, so percentages stay consistent with the total. */
export function withSeededCrowd(moment: Pick<FeedMoment, "id" | "options" | "result">): CrowdSnapshot {
  const real = moment.result;
  const base = seededCount(moment.id, "responses");
  const optionCounts: Record<string, number> = { ...real?.optionCounts };

  if (moment.options.length) {
    const weights = moment.options.map((o) => 1 + 4 * unit(`${moment.id}:${o.id}`));
    const sum = weights.reduce((a, b) => a + b, 0);
    const seeded = weights.map((w) => Math.floor((base * w) / sum));
    seeded[0] += base - seeded.reduce((a, b) => a + b, 0);
    moment.options.forEach((o, i) => {
      optionCounts[o.id] = (real?.optionCounts?.[o.id] ?? 0) + seeded[i];
    });
  }

  return {
    ...real,
    totalResponses: (real?.totalResponses ?? 0) + base,
    optionCounts,
  };
}
