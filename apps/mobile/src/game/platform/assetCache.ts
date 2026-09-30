import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import { AssetIndex, assetFileName } from "../content/assetIndex";

const INDEX_KEY = "playbyte.game.assetIndex.v1";
const MAX_BYTES = 100 * 1024 * 1024;
const TTL_MS = 14 * 24 * 3600_000;
const CONCURRENCY = 3;

const index = new AssetIndex({ maxBytes: MAX_BYTES, ttlMs: TTL_MS });
let loading: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const inflight = new Map<string, Promise<void>>();

function dir(): Directory {
  const d = new Directory(Paths.cache, "game-assets");
  d.create({ intermediates: true, idempotent: true });
  return d;
}

function ensureLoaded(): Promise<void> {
  if (!loading) {
    loading = AsyncStorage.getItem(INDEX_KEY)
      .then((raw) => {
        index.load(raw ? JSON.parse(raw) : []);
        removeFiles(index.evict());
      })
      .catch(() => {
        index.clear();
      });
  }
  return loading;
}

function persistSoon() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index.toJSON())).catch(() => {});
  }, 1000);
}

function removeFiles(entries: { file: string }[]) {
  for (const e of entries) {
    try {
      const f = new File(e.file);
      if (f.exists) f.delete();
    } catch {
      // already gone
    }
  }
  if (entries.length) persistSoon();
}

/** Local file URI for a cached remote asset, else the remote URL (the image loader fetches it). */
export function resolveAsset(url: string): string {
  return index.get(url)?.file ?? url;
}

async function download(url: string): Promise<void> {
  if (index.get(url)) return;
  const target = new File(dir(), assetFileName(url));
  const out = await File.downloadFileAsync(url, target, { idempotent: true });
  removeFiles(index.put({ url, file: out.uri, bytes: out.size, fetchedAt: Date.now() }));
  persistSoon();
}

/** Downloads missing assets (bounded concurrency). Failures are ignored: the UI falls back to the URL. */
export async function prefetchAssets(urls: string[]): Promise<void> {
  await ensureLoaded();
  const queue = [...new Set(urls.filter((u) => /^https:\/\//.test(u)))].filter((u) => !index.get(u));
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      let p = inflight.get(url);
      if (!p) {
        p = download(url)
          .catch(() => {})
          .finally(() => inflight.delete(url!));
        inflight.set(url, p);
      }
      await p;
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

export async function clearAssetCache(): Promise<void> {
  await ensureLoaded();
  removeFiles(index.clear());
}

export function assetCacheStats() {
  return { files: index.size, bytes: index.totalBytes, maxBytes: MAX_BYTES };
}
