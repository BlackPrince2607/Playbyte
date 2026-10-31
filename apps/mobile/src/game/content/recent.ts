import type { Rng } from "../core/rng";

/**
 * Sample up to `k` items, preferring ones not in `avoid`. When the fresh set is too small,
 * fills the rest from avoided items so games still start with a full pool.
 */
export function samplePreferFresh<T extends { id: string }>(
  items: readonly T[],
  avoid: ReadonlySet<string> | readonly string[],
  rng: Rng,
  k: number,
): T[] {
  const take = Math.max(0, Math.min(k, items.length));
  if (!take) return [];
  const avoidSet = avoid instanceof Set ? avoid : new Set(avoid);
  if (!avoidSet.size) return rng.sample(items, take);

  const fresh = items.filter((i) => !avoidSet.has(i.id));
  if (fresh.length >= take) return rng.sample(fresh, take);

  const stale = items.filter((i) => avoidSet.has(i.id));
  return [...rng.shuffle(fresh), ...rng.sample(stale, take - fresh.length)];
}

/**
 * IDs to treat as already-used at session start so the first rounds skip recent content.
 * Always leaves at least `keepFresh` pool ids available (or the whole pool when smaller).
 */
export function seedUsedFromRecent(
  poolIds: readonly string[],
  avoid: readonly string[],
  keepFresh: number,
): string[] {
  if (!poolIds.length || !avoid.length) return [];
  const inPool = new Set(poolIds);
  const recent = avoid.filter((id) => inPool.has(id));
  const maxUsed = Math.max(0, poolIds.length - Math.max(1, keepFresh));
  return recent.slice(-maxUsed);
}

/** Pull content ids from an engine state that tracks `used` (quiz / choice / word-search). */
export function usedIdsFromState(state: unknown): string[] {
  if (!state || typeof state !== "object" || Array.isArray(state)) return [];
  const used = (state as { used?: unknown }).used;
  if (!Array.isArray(used)) return [];
  return used.filter((id): id is string => typeof id === "string" && id.length > 0);
}
