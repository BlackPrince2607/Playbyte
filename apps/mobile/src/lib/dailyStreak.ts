/** Local calendar day as YYYY-MM-DD (not UTC). */
export function localDateString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function previousLocalDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() - 1);
  return localDateString(dt);
}

/**
 * One streak per local day. Same day keeps the count, yesterday continues it,
 * and any gap — including a missing date from the old per-answer counter — starts at 1.
 */
export function nextDailyStreak(current: number, storedDate: string | null, today: string): number {
  if (storedDate === today) return current;
  if (storedDate && storedDate === previousLocalDate(today)) return Math.max(0, current) + 1;
  return 1;
}
