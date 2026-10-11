/** Compact "time since" label for comment rows: now, 5m, 3h, 2d, 4w. */
export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(s) || s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 604_800) return `${Math.floor(s / 86_400)}d`;
  return `${Math.floor(s / 604_800)}w`;
}
