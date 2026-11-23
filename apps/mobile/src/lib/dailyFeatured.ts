import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FeedGame } from "../api";
import { localDateString } from "./dailyStreak";
import { canLaunchGame, listCatalogKeys, resolveFeedGame } from "./gameCatalog";

const PLAYED_KEY = "maja_daily_featured_played";

/** Stable hash so the same local day always picks the same featured game. */
function dayHash(day: string): number {
  let h = 0;
  for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) >>> 0;
  return h;
}

/** Flip to `true` to bring back the feed “Today’s challenge” banner. */
const DAILY_FEATURED_ENABLED = false;

/**
 * Today's featured mini-game from the catalog (deterministic by local calendar day).
 * Falls back to null when the catalog is empty / unreachable, or already played today.
 */
export async function getDailyFeaturedGame(now = new Date()): Promise<FeedGame | null> {
  if (!DAILY_FEATURED_ENABLED) return null;
  const day = localDateString(now);
  if (await hasPlayedDailyFeatured(day)) return null;
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

/** True once the player has opened today's featured challenge. */
export async function hasPlayedDailyFeatured(day = featuredDayKey()): Promise<boolean> {
  return (await AsyncStorage.getItem(PLAYED_KEY)) === day;
}

/** Hide the banner for the rest of the local day after the player taps play. */
export async function markDailyFeaturedPlayed(day = featuredDayKey()): Promise<void> {
  await AsyncStorage.setItem(PLAYED_KEY, day);
}
