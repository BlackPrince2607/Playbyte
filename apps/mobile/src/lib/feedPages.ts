import type { FeedItem } from "../api";

const baseKey = (item: FeedItem) => (item.type === "moment" ? `m:${item.id}` : `g:${item.key}`);

/** How many items back a moment must be before it may show again; the server loops through moments forever. */
export const MOMENT_REPEAT_GAP = 20;

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
