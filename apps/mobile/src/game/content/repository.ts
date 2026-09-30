/**
 * Content repository: remote packs (ETag revalidation) -> local cache -> bundled fallback.
 * Platform-free: fetching, caching and fallback loading are injected.
 */
import type { GameDefinition } from "../core/definition";
import { ContentBundle, ContentItem, ContentQuery, ContentSource, emptyBundle } from "./types";
import { validatePack } from "./validate";

export type PackResponse = { status: 200; etag?: string; items: unknown } | { status: 304 };
export type PackFetcher = (packId: string, etag?: string) => Promise<PackResponse>;

export type CachedPack = { packId: string; etag?: string; items: ContentItem[]; fetchedAt: number };
export type PackCache = {
  read(packId: string): Promise<CachedPack | null>;
  write(pack: CachedPack): Promise<void>;
};

export type RepositoryDeps = {
  fetchPack: PackFetcher;
  cache: PackCache;
  /** Bundled packs shipped with the app (small; text/emoji only). */
  fallback: (packId: string) => Promise<unknown | null>;
  now?: () => number;
  /** A cached pack younger than this is used without a network round-trip. */
  ttlMs?: number;
  timeoutMs?: number;
  onReject?: (packId: string, rejected: { id?: string; error: string }[]) => void;
  /** Packs kept decoded in memory (LRU). */
  memoryPacks?: number;
};

export type LoadedPack = { items: ContentItem[]; source: ContentSource };

export type ContentRepository = {
  loadPack(packId: string): Promise<LoadedPack>;
  load(queries: ContentQuery[], def: GameDefinition): Promise<ContentBundle>;
  /** Drops decoded packs from memory (e.g. on memory warning). */
  trim(): void;
};

/** Packs a definition needs: an explicit packId, otherwise one pack per requested content type. */
export function packIdsFor(queries: ContentQuery[], def: GameDefinition): string[] {
  if (def.content?.packId) return [def.content.packId];
  return [...new Set(queries.flatMap((q) => q.types))];
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function createContentRepository(deps: RepositoryDeps): ContentRepository {
  const now = deps.now ?? (() => Date.now());
  const ttlMs = deps.ttlMs ?? 6 * 3600_000;
  const timeoutMs = deps.timeoutMs ?? 6000;
  const memMax = deps.memoryPacks ?? 4;
  const memory = new Map<string, LoadedPack>();
  const inflight = new Map<string, Promise<LoadedPack>>();

  const remember = (id: string, p: LoadedPack) => {
    memory.delete(id);
    memory.set(id, p);
    while (memory.size > memMax) memory.delete(memory.keys().next().value as string);
    return p;
  };

  async function fromFallback(packId: string): Promise<LoadedPack | null> {
    const raw = await deps.fallback(packId).catch(() => null);
    if (!raw) return null;
    const v = validatePack(raw);
    if (v.rejected.length) deps.onReject?.(packId, v.rejected);
    return v.items.length ? { items: v.items, source: "fallback" } : null;
  }

  async function resolvePack(packId: string): Promise<LoadedPack> {
    const cached = await deps.cache.read(packId).catch(() => null);
    if (cached && now() - cached.fetchedAt < ttlMs && cached.items.length) {
      return { items: cached.items, source: "cache" };
    }
    try {
      const res = await withTimeout(deps.fetchPack(packId, cached?.etag), timeoutMs);
      if (res.status === 304 && cached) {
        void deps.cache.write({ ...cached, fetchedAt: now() }).catch(() => {});
        return { items: cached.items, source: "cache" };
      }
      if (res.status === 200) {
        const v = validatePack(res.items);
        if (v.rejected.length) deps.onReject?.(packId, v.rejected);
        if (v.items.length) {
          void deps.cache.write({ packId, etag: res.etag, items: v.items, fetchedAt: now() }).catch(() => {});
          return { items: v.items, source: "remote" };
        }
      }
    } catch {
      // offline / timeout / server error: fall through to stale cache or fallback
    }
    if (cached?.items.length) return { items: cached.items, source: "cache" };
    return (await fromFallback(packId)) ?? { items: [], source: "none" };
  }

  async function loadPack(packId: string): Promise<LoadedPack> {
    const hit = memory.get(packId);
    if (hit) return remember(packId, hit);
    const pending = inflight.get(packId);
    if (pending) return pending;
    const p = resolvePack(packId)
      .then((r) => (r.items.length ? remember(packId, r) : r))
      .finally(() => inflight.delete(packId));
    inflight.set(packId, p);
    return p;
  }

  return {
    loadPack,
    async load(queries, def) {
      if (!queries.length) return emptyBundle;
      const ids = packIdsFor(queries, def);
      const packs = await Promise.all(ids.map((id) => loadPack(id)));
      const items = packs.flatMap((p) => p.items);
      const rank: ContentSource[] = ["none", "fallback", "cache", "remote"];
      const source = packs.reduce<ContentSource>((worst, p) => (rank.indexOf(p.source) < rank.indexOf(worst) ? p.source : worst), "remote");
      return { items, source: items.length ? source : "none", packIds: ids };
    },
    trim() {
      memory.clear();
    },
  };
}
