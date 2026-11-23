import type { FeedGame } from "../api";

/**
 * Quiz-like + board engines that play on the feed card (glass PLAY shell).
 * Arcade (`tap`, `tap_dont_tap`, `lane_dash`) stays intro → GameHost.
 */
export const INLINE_FEED_ENGINES = new Set([
  "guess",
  "emoji_guess",
  "odd_one_out",
  "math_rush",
  "fact_fake",
  "choice",
  "memory",
  "arrow_puzzle",
  "spot_difference",
  "word_search",
  "maze",
  "connect_dots",
]);

export function feedEngineId(item: Pick<FeedGame, "engine" | "config">): string | undefined {
  if (typeof item.engine === "string" && item.engine) return item.engine;
  const fromConfig = item.config?.engine;
  return typeof fromConfig === "string" && fromConfig ? fromConfig : undefined;
}

export function isInlineFeedGame(item: Pick<FeedGame, "engine" | "config">): boolean {
  const engine = feedEngineId(item);
  return !!engine && INLINE_FEED_ENGINES.has(engine);
}
