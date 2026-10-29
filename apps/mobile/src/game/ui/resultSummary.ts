/**
 * Turns an engine result breakdown into rows for the post-game screen. Breakdowns mix additive
 * point components with plain stats, and some keys (`total`, tap `bonus`) repeat points already
 * counted, so only whitelisted keys are shown.
 */
const POINTS: [key: string, label: string][] = [
  ["base", "Correct answers"],
  ["participation", "Taking part"],
  ["agreement", "Crowd agreement"],
  ["speed", "Speed"],
  ["time", "Time left"],
  ["clear", "Board cleared"],
  ["length", "Long words"],
  ["accuracy", "Accuracy"],
  ["gems", "Gems"],
  ["perfect", "Perfect fill"],
  ["efficiency", "Efficiency"],
  ["streak", "Streaks"],
  ["difficulty", "Difficulty"],
  ["hints", "Hints"],
  ["mistakes", "Mistakes"],
];

const STATS: [key: string, label: string, format?: (v: number) => string][] = [
  ["hits", "Hits"],
  ["misses", "Misses"],
  ["escaped", "Got away"],
  ["bestStreak", "Best streak"],
  ["cleared", "Arrows cleared"],
  ["blocked", "Blocked taps"],
  ["boards", "Boards cleared"],
  ["bestReactionMs", "Best reaction", (v) => `${Math.round(v)} ms`],
];

export type ScoreRow = { label: string; value: number };
export type StatRow = { label: string; value: string };

export function scoreRows(breakdown?: Record<string, number>): ScoreRow[] {
  if (!breakdown) return [];
  return POINTS.flatMap(([key, label]) => {
    const v = Math.round(breakdown[key] ?? 0);
    return v ? [{ label, value: v }] : [];
  });
}

export type ResultHeadline = { title: string; celebrate: boolean };

/**
 * Fake "players beaten today" for social proof. Stable for a given score + percentile so the
 * pill does not flicker on re-render. When percentile is unknown, invents one from the score.
 */
export function fakeBeatenCount(percentile: number | null, score: number): { pct: number; count: number } {
  const pct =
    percentile === null
      ? Math.min(92, Math.max(22, 28 + (Math.abs(score) % 61)))
      : Math.max(0, Math.min(100, Math.round(percentile)));
  const pool = 2_400 + ((Math.abs(score) * 37 + pct * 91) % 3_600);
  const count = Math.max(12, Math.round((pct / 100) * pool));
  return { pct, count };
}

/** Headline for the result screen, from the percentile when known, else from accuracy. */
export function resultHeadline({ percentile, correct, attempts }: { percentile: number | null; correct?: number; attempts?: number }): ResultHeadline {
  const accuracy = attempts && correct !== undefined ? correct / attempts : null;
  const perfect = accuracy === 1 && (attempts ?? 0) >= 3;
  if (percentile !== null) {
    if (percentile >= 90) return { title: "Legendary run!", celebrate: true };
    if (percentile >= 70) return { title: "Strong run!", celebrate: true };
    if (perfect) return { title: "Flawless!", celebrate: true };
    return { title: percentile >= 40 ? "Solid run." : "Nice try.", celebrate: false };
  }
  if (perfect) return { title: "Flawless!", celebrate: true };
  if (accuracy === null) return { title: "Run complete.", celebrate: false };
  if (accuracy >= 0.7) return { title: "Strong run!", celebrate: true };
  return { title: accuracy >= 0.4 ? "Solid run." : "Nice try.", celebrate: false };
}

export function statRows(breakdown?: Record<string, number>): StatRow[] {
  if (!breakdown) return [];
  return STATS.flatMap(([key, label, format]) => {
    const v = breakdown[key];
    return typeof v === "number" && Number.isFinite(v) ? [{ label, value: format ? format(v) : String(Math.round(v)) }] : [];
  });
}
