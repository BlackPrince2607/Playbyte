import type { FeedItem } from "../api";

const baseKey = (item: FeedItem) => (item.type === "moment" ? `m:${item.id}` : `g:${item.key}`);

/** How many items back a moment must be before it may show again; the server loops through moments forever. */
export const MOMENT_REPEAT_GAP = 20;

/** Cards kept loaded ahead of the viewer; a feed page takes a few swipes to arrive, so fetching starts this early. */
export const FEED_PREFETCH_AHEAD = 8;

/** Appends the next feed page: moments shown within the last few items are skipped, and a game never follows itself. */
export function appendFeedPage(current: FeedItem[], page: FeedItem[]): FeedItem[] {
  const seenMoments = new Set(
    current.slice(-MOMENT_REPEAT_GAP).flatMap((i) => (i.type === "moment" ? [i.id] : [])),
  );
  const added: FeedItem[] = [];
  let last = current[current.length - 1];
  for (const item of page) {
    if (item.type === "moment" && seenMoments.has(item.id)) continue;
    if (item.type === "mini_game" && last?.type === "mini_game" && last.key === item.key) continue;
    if (item.type === "moment") seenMoments.add(item.id);
    added.push(item);
    last = item;
  }
  return added.length ? [...current, ...added] : current;
}

/**
 * Soft refresh: keep the in-progress feed and stitch the new page onto the end so fresh
 * questions appear after a swipe or two. Returns null when the server has no moments but
 * the viewer still does — never collapse an active feed to games-only.
 */
export function continueFeedRefresh(current: FeedItem[], page: FeedItem[]): FeedItem[] | null {
  if (!current.length) return null;
  const pageHasMoments = page.some((i) => i.type === "moment");
  const currentHasMoments = current.some((i) => i.type === "moment");
  if (!pageHasMoments && currentHasMoments) return null;
  return appendFeedPage(current, page);
}

/** List keys that stay stable as pages are appended, even though games repeat across pages. */
export function feedKeys(items: FeedItem[]): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const key = baseKey(item);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return n ? `${key}:${n}` : key;
  });
}
