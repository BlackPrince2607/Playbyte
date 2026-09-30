/**
 * Bookkeeping for the on-device media cache: LRU order, TTL expiry and a total size cap.
 * Pure; the platform layer does the actual downloads and deletes the files this reports as evicted.
 */
export type AssetEntry = { url: string; file: string; bytes: number; fetchedAt: number; lastUsed: number };

export type AssetIndexOptions = { maxBytes: number; ttlMs: number; now?: () => number };

export class AssetIndex {
  private entries = new Map<string, AssetEntry>();
  private bytes = 0;
  private readonly now: () => number;

  constructor(private readonly opts: AssetIndexOptions) {
    this.now = opts.now ?? (() => Date.now());
  }

  get totalBytes() {
    return this.bytes;
  }

  get size() {
    return this.entries.size;
  }

  /** Fresh entry for a URL (marks it recently used), or undefined when missing/expired. */
  get(url: string): AssetEntry | undefined {
    const e = this.entries.get(url);
    if (!e) return undefined;
    if (this.now() - e.fetchedAt > this.opts.ttlMs) return undefined;
    e.lastUsed = this.now();
    this.entries.delete(url);
    this.entries.set(url, e);
    return e;
  }

  /** Records a downloaded file; returns entries that must be deleted to respect the cap and TTL. */
  put(entry: Omit<AssetEntry, "lastUsed"> & { lastUsed?: number }): AssetEntry[] {
    const evicted: AssetEntry[] = [];
    const old = this.entries.get(entry.url);
    if (old) {
      this.entries.delete(entry.url);
      this.bytes -= old.bytes;
      if (old.file !== entry.file) evicted.push(old);
    }
    const e: AssetEntry = { ...entry, lastUsed: entry.lastUsed ?? this.now() };
    this.entries.set(e.url, e);
    this.bytes += e.bytes;
    evicted.push(...this.evict(e.url));
    return evicted;
  }

  remove(url: string): AssetEntry | undefined {
    const e = this.entries.get(url);
    if (!e) return undefined;
    this.entries.delete(url);
    this.bytes -= e.bytes;
    return e;
  }

  /** Expired entries first, then least recently used, until under the cap. Never evicts `keep`. */
  evict(keep?: string): AssetEntry[] {
    const out: AssetEntry[] = [];
    const t = this.now();
    for (const e of [...this.entries.values()]) {
      if (e.url !== keep && t - e.fetchedAt > this.opts.ttlMs) out.push(this.remove(e.url)!);
    }
    for (const e of [...this.entries.values()]) {
      if (this.bytes <= this.opts.maxBytes) break;
      if (e.url !== keep) out.push(this.remove(e.url)!);
    }
    return out;
  }

  clear(): AssetEntry[] {
    const all = [...this.entries.values()];
    this.entries.clear();
    this.bytes = 0;
    return all;
  }

  toJSON(): AssetEntry[] {
    return [...this.entries.values()];
  }

  load(list: unknown) {
    this.clear();
    if (!Array.isArray(list)) return;
    const sorted = list
      .filter(
        (e): e is AssetEntry =>
          !!e && typeof e.url === "string" && typeof e.file === "string" && typeof e.bytes === "number" && typeof e.fetchedAt === "number",
      )
      .sort((a, b) => (a.lastUsed ?? 0) - (b.lastUsed ?? 0));
    for (const e of sorted) {
      this.entries.set(e.url, { ...e, lastUsed: e.lastUsed ?? e.fetchedAt });
      this.bytes += e.bytes;
    }
  }
}

/** Stable file name for a URL (FNV-1a hash + original extension). */
export function assetFileName(url: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const ext = /\.(png|jpe?g|webp|gif|svg|mp3|m4a|aac|json)(\?|$)/i.exec(url)?.[1]?.toLowerCase() ?? "bin";
  return `${(h >>> 0).toString(36)}-${url.length.toString(36)}.${ext}`;
}
