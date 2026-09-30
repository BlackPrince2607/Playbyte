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

export function statRows(breakdown?: Record<string, number>): StatRow[] {
  if (!breakdown) return [];
  return STATS.flatMap(([key, label, format]) => {
    const v = breakdown[key];
    return typeof v === "number" && Number.isFinite(v) ? [{ label, value: format ? format(v) : String(Math.round(v)) }] : [];
  });
}
