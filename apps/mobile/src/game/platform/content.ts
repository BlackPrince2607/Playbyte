import { AppState } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { getApiBaseUrl } from "../../lib/env";
import type { GameDefinition } from "../core/definition";
import { CachedPack, PackCache, PackResponse, createContentRepository } from "../content/repository";
import { FALLBACK_PACKS } from "../content/packs";
import { ContentBundle, ContentQuery } from "../content/types";
import { getContentLocale, onContentLocaleChange } from "../../i18n/contentLocale";
import { prefetchAssets } from "./assetCache";

export { resolveAsset } from "./assetCache";

const safeName = (packId: string) => packId.replace(/[^a-z0-9_.-]/gi, "_");

function cacheName(packId: string) {
  return `${safeName(packId)}__${getContentLocale()}.json`;
}

function packDir(): Directory {
  const d = new Directory(Paths.cache, "game-content");
  d.create({ intermediates: true, idempotent: true });
  return d;
}

const fileCache: PackCache = {
  async read(packId) {
    const f = new File(packDir(), cacheName(packId));
    if (!f.exists) return null;
    return JSON.parse(await f.text()) as CachedPack;
  },
  async write(pack) {
    const f = new File(packDir(), cacheName(pack.packId));
    f.write(JSON.stringify(pack));
  },
};

async function requestPack(packId: string, etag: string | undefined, locale?: string): Promise<PackResponse> {
  const query = locale ? `?locale=${encodeURIComponent(locale)}` : "";
  const res = await fetch(`${getApiBaseUrl()}/v1/content/packs/${encodeURIComponent(packId)}${query}`, {
    headers: etag ? { "If-None-Match": etag } : {},
  });
  if (res.status === 304) return { status: 304 };
  if (!res.ok) throw new Error(`pack ${packId}: HTTP ${res.status}`);
  const body = (await res.json()) as { items?: unknown };
  return { status: 200, etag: res.headers.get("ETag") ?? undefined, items: body.items };
}

async function fetchPack(packId: string, etag?: string): Promise<PackResponse> {
  if (getContentLocale() === "hi-IN") {
    try {
      const hi = await requestPack(packId, etag, "hi-IN");
      if (hi.status === 304) return hi;
      if (hi.status === 200 && Array.isArray(hi.items) && hi.items.length > 0) return hi;
    } catch {
      // No Hindi pack yet — play the English one.
    }
  }
  return requestPack(packId, etag);
}

const repository = createContentRepository({
  fetchPack,
  cache: fileCache,
  fallback: async (packId) => (FALLBACK_PACKS[packId] ? FALLBACK_PACKS[packId]() : null),
  onReject: (packId, rejected) => {
    if (__DEV__) console.warn(`[content] ${packId}: ${rejected.length} item(s) rejected`, rejected.slice(0, 3));
  },
});

let memoryHook = false;
onContentLocaleChange(() => repository.trim());

/** Loads the content an engine needs, then warms the media cache for the first items. */
export async function loadContent(queries: ContentQuery[], def: GameDefinition): Promise<ContentBundle> {
  if (!memoryHook) {
    memoryHook = true;
    AppState.addEventListener("memoryWarning", () => repository.trim());
  }
  const bundle = await repository.load(queries, def);
  const urls = bundle.items.flatMap((i) => (i.media ?? []).flatMap((m) => (m.kind === "image" ? [m.thumbUrl ?? m.url] : [])));
  if (urls.length) {
    // Warm the first few with a short cap so a slow network never blocks the start.
    await Promise.race([prefetchAssets(urls.slice(0, 8)), new Promise((r) => setTimeout(r, 2500))]);
    void prefetchAssets(urls.slice(8, 60));
  }
  return bundle;
}
