import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FeedItem } from "../api";

const KEY = "maja_feed_snapshot_v1";

/** Max cards kept on disk — enough for an instant reopen without bloating storage. */
const MAX_ITEMS = 40;

export type FeedSnapshot = {
  lang: string;
  items: FeedItem[];
  cursor: string | null;
  savedAt: number;
};

function isFeedItem(v: unknown): v is FeedItem {
  if (!v || typeof v !== "object") return false;
  const t = (v as { type?: unknown }).type;
  return t === "moment" || t === "mini_game";
}

function hasMoments(items: FeedItem[]): boolean {
  return items.some((i) => i.type === "moment");
}

export async function readFeedSnapshot(lang: string): Promise<FeedSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FeedSnapshot>;
    if (parsed.lang !== lang) return null;
    if (!Array.isArray(parsed.items) || !parsed.items.length) return null;
    const items = parsed.items.filter(isFeedItem).slice(0, MAX_ITEMS);
    // Games-only leftovers from an empty moment pool must not boot the app into that state.
    if (!items.length || !hasMoments(items)) {
      if (items.length && !hasMoments(items)) await AsyncStorage.removeItem(KEY);
      return null;
    }
    return {
      lang: parsed.lang,
      items,
      cursor: typeof parsed.cursor === "string" ? parsed.cursor : null,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export async function writeFeedSnapshot(snap: Omit<FeedSnapshot, "savedAt">): Promise<void> {
  try {
    const items = snap.items.slice(0, MAX_ITEMS);
    // Never persist a games-only feed — cold start would look like polls vanished.
    if (!hasMoments(items)) {
      await AsyncStorage.removeItem(KEY);
      return;
    }
    const payload: FeedSnapshot = {
      lang: snap.lang,
      items,
      cursor: snap.cursor,
      savedAt: Date.now(),
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* disk full / private mode — feed still works from network */
  }
}
