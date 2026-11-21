import { api, type FeedGame } from "../api";
import { isPlayable } from "../game/discovery";
import { LEGACY_REPLACEMENTS } from "../game/engines/replacements";
import { prefetchGame } from "../game/platform/prefetchGame";

type CatalogGame = {
  key: string;
  title: string;
  blurb: string;
  config?: Record<string, unknown>;
  engine?: string;
  variation?: string;
};

/** Optional fields the match/challenge API can attach so we never need a feed hit. */
export type GameLaunchHint = {
  title?: string;
  blurb?: string;
  engine?: string;
  variation?: string;
  config?: Record<string, unknown>;
};

let cache: CatalogGame[] | null = null;
let inflight: Promise<CatalogGame[]> | null = null;

async function loadCatalog(): Promise<CatalogGame[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = api<{ games: CatalogGame[] }>("/v1/games/catalog")
    .then((res) => {
      cache = res.games ?? [];
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Public catalog keys for daily featured / discovery surfaces. */
export async function listCatalogKeys(): Promise<string[]> {
  try {
    return (await loadCatalog()).map((g) => g.key).filter(Boolean);
  } catch {
    return [];
  }
}

function fromParts(
  key: string,
  parts: {
    title?: string;
    blurb?: string;
    engine?: string;
    variation?: string;
    config?: Record<string, unknown>;
  },
): FeedGame {
  return {
    type: "mini_game",
    key,
    title: parts.title || key,
    blurb: parts.blurb || "",
    config: parts.config,
    engine: parts.engine,
    variation: parts.variation,
  };
}

function fromLegacy(key: string, title?: string): FeedGame | null {
  const rep = LEGACY_REPLACEMENTS[key];
  if (!rep || typeof rep.engine !== "string") return null;
  return fromParts(key, {
    title,
    engine: rep.engine,
    variation: typeof rep.variation === "string" ? rep.variation : undefined,
    config: rep,
  });
}

function hasLaunchMeta(g: FeedGame | CatalogGame | GameLaunchHint | undefined | null): boolean {
  if (!g) return false;
  if ("engine" in g && typeof g.engine === "string" && g.engine) return true;
  if ("config" in g && g.config && typeof g.config.engine === "string") return true;
  return false;
}

/** True when this card can actually boot in GameHost. */
export function canLaunchGame(card: FeedGame): boolean {
  return isPlayable(card);
}

/**
 * Build a playable FeedGame for online/challenge launch.
 * Order: feed → API hint (match payload) → games catalog → legacy replacements.
 * Prefetches the engine when the card is playable so the countdown feels instant.
 */
export async function resolveFeedGame(
  key: string,
  opts: { title?: string; feed?: readonly FeedGame[]; hint?: GameLaunchHint } = {},
): Promise<FeedGame> {
  const fromFeed = opts.feed?.find((g) => g.key === key);
  let card: FeedGame | null = null;

  if (fromFeed && hasLaunchMeta(fromFeed)) {
    card = fromFeed;
  } else if (opts.hint && hasLaunchMeta(opts.hint)) {
    card = fromParts(key, {
      title: opts.hint.title || opts.title || fromFeed?.title,
      blurb: opts.hint.blurb || fromFeed?.blurb,
      engine: opts.hint.engine,
      variation: opts.hint.variation,
      config: opts.hint.config ?? fromFeed?.config,
    });
  } else {
    try {
      const entry = (await loadCatalog()).find((g) => g.key === key);
      if (entry && hasLaunchMeta(entry)) {
        card = fromParts(key, {
          title: entry.title || opts.title || opts.hint?.title,
          blurb: entry.blurb || opts.hint?.blurb,
          engine: entry.engine,
          variation: entry.variation,
          config: entry.config,
        });
      }
    } catch {
      /* catalog unavailable — try legacy / feed stub next */
    }
  }

  if (!card) {
    card = fromLegacy(key, opts.title || opts.hint?.title || fromFeed?.title) ?? fromFeed ?? fromParts(key, {
      title: opts.title || opts.hint?.title,
      blurb: opts.hint?.blurb,
      engine: opts.hint?.engine,
      variation: opts.hint?.variation,
      config: opts.hint?.config,
    });
  }

  if (canLaunchGame(card)) {
    prefetchGame(card);
  }
  return card;
}

/**
 * Pick a random playable game for a battle category.
 * Empty `pool` (Mixed) uses any catalog game; otherwise intersects pool ∩ catalog.
 */
export async function pickCategoryGame(
  pool: readonly string[],
  opts: { feed?: readonly FeedGame[] } = {},
): Promise<FeedGame> {
  let keys = [...pool];
  try {
    const catalog = await loadCatalog();
    const catalogKeys = new Set(catalog.map((g) => g.key));
    if (keys.length === 0) {
      keys = catalog.map((g) => g.key);
    } else {
      const enabled = keys.filter((k) => catalogKeys.has(k));
      if (enabled.length) keys = enabled;
    }
  } catch {
    /* use pool / feed fallback */
  }

  if (keys.length === 0 && opts.feed?.length) {
    keys = opts.feed.map((g) => g.key);
  }
  if (keys.length === 0) {
    throw new Error("no_playable_games");
  }

  // Try a few random picks until one launches (skips disabled/unknown engines).
  const shuffled = [...keys].sort(() => Math.random() - 0.5);
  for (const key of shuffled.slice(0, Math.min(8, shuffled.length))) {
    const game = await resolveFeedGame(key, { feed: opts.feed });
    if (canLaunchGame(game)) return game;
  }
  const fallback = await resolveFeedGame(shuffled[0]!, { feed: opts.feed });
  if (!canLaunchGame(fallback)) throw new Error("no_playable_games");
  return fallback;
}
