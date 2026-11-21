import type { FeedGame } from "../api";
import { localDateString } from "./dailyStreak";
import { canLaunchGame, listCatalogKeys, resolveFeedGame } from "./gameCatalog";

/** Stable hash so the same local day always picks the same featured game. */
function dayHash(day: string): number {
  let h = 0;
  for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Today's featured mini-game from the catalog (deterministic by local calendar day).
 * Falls back to null when the catalog is empty / unreachable.
 */
export async function getDailyFeaturedGame(now = new Date()): Promise<FeedGame | null> {
  const day = localDateString(now);
  const keys = await listCatalogKeys();
  if (keys.length === 0) return null;
  const start = dayHash(day) % keys.length;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length]!;
    try {
      const game = await resolveFeedGame(key);
      if (canLaunchGame(game)) return game;
    } catch {
      /* try next */
    }
  }
  return null;
}

export function featuredDayKey(now = new Date()): string {
  return localDateString(now);
}
