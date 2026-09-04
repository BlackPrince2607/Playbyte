/** Default TTL for social/profile caches during an app session. */
export const SESSION_CACHE_MS = 60_000;

export function isCacheFresh(fetchedAt: number | null, ttlMs = SESSION_CACHE_MS): boolean {
  if (fetchedAt === null) return false;
  return Date.now() - fetchedAt < ttlMs;
}
