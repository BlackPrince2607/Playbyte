import { Image } from "react-native";
import type { FeedMoment } from "../api";

const warmed = new Set<string>();

/** Remote image URLs a moment card needs (prompt + option tiles). */
export function momentImageUrls(moment: FeedMoment): string[] {
  const urls: string[] = [];
  if (moment.promptImageUrl) urls.push(moment.promptImageUrl);
  for (const option of moment.options) {
    if (option.imageUrl) urls.push(option.imageUrl);
  }
  return urls;
}

/**
 * Warm poll/prompt images into the native Image cache before the card is on screen.
 * Safe to call repeatedly; each URL is fetched at most once per session (retry on failure).
 */
export function prefetchMomentImages(moment: FeedMoment): void {
  for (const url of momentImageUrls(moment)) {
    if (warmed.has(url)) continue;
    warmed.add(url);
    void Image.prefetch(url).catch(() => {
      warmed.delete(url);
    });
  }
}
