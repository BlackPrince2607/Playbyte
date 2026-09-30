/**
 * Composable scoring primitives. Integer arithmetic only, so a score is reproducible from its
 * inputs on any device (and on the server, for replay verification). Engines compose these into
 * their own formula; tuning values come from `definition.scoring`.
 */
import { GameDefinition } from "../core/definition";

const clampInt = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(x)));

/** points * pct / 100, floored. */
export function applyPct(points: number, pct: number): number {
  return Math.floor((Math.round(points) * Math.round(pct)) / 100);
}

/** Percentage multiplier for difficulty: 100 at level 0 up to 100 + maxBonusPct at level 1. */
export function difficultyMultiplier(level: number, maxBonusPct = 50): number {
  return 100 + clampInt(Math.max(0, Math.min(1, level)) * maxBonusPct, 0, maxBonusPct);
}

/** Bonus for answering fast: max at 0 ms, 0 at/after the limit. */
export function speedBonus(responseMs: number, limitMs: number, max: number, curve: "linear" | "quadratic" = "linear"): number {
  if (max <= 0 || limitMs <= 0) return 0;
  const left = clampInt(limitMs - responseMs, 0, limitMs);
  if (curve === "quadratic") return Math.floor((max * left * left) / (limitMs * limitMs));
  return Math.floor((max * left) / limitMs);
}

/** Bonus per consecutive correct answer beyond the first, capped. */
export function streakBonus(streak: number, perStep: number, cap: number): number {
  return clampInt(Math.max(0, streak - 1) * perStep, 0, Math.max(0, cap));
}

export function hintPenalty(hintsUsed: number, per: number): number {
  return Math.max(0, Math.round(hintsUsed)) * Math.max(0, Math.round(per));
}

export function mistakePenalty(mistakes: number, per: number): number {
  return Math.max(0, Math.round(mistakes)) * Math.max(0, Math.round(per));
}

/** Bonus proportional to unused time (end-of-game or end-of-round). */
export function timeRemainingBonus(remainingMs: number, totalMs: number, max: number): number {
  if (totalMs <= 0 || max <= 0) return 0;
  return Math.floor((max * clampInt(remainingMs, 0, totalMs)) / totalMs);
}

/** Standard per-answer formula shared by quiz-style engines (Guess, Emoji, Odd One Out, Fact/Fake). */
export type AnswerScoring = {
  base: number;
  speedMax: number;
  speedCurve: "linear" | "quadratic";
  streakStep: number;
  streakCap: number;
  hintPenalty: number;
  mistakePenalty: number;
  difficultyBonusPct: number;
};

export const DEFAULT_ANSWER_SCORING: AnswerScoring = {
  base: 10,
  speedMax: 5,
  speedCurve: "linear",
  streakStep: 1,
  streakCap: 5,
  hintPenalty: 3,
  mistakePenalty: 0,
  difficultyBonusPct: 50,
};

/** Reads numeric overrides from `definition.scoring` (unknown keys are ignored). */
export function answerScoring(def: GameDefinition, defaults: AnswerScoring = DEFAULT_ANSWER_SCORING): AnswerScoring {
  const s = def.scoring;
  const n = (k: keyof AnswerScoring, lo: number, hi: number) =>
    typeof s[k] === "number" ? clampInt(s[k] as number, lo, hi) : (defaults[k] as number);
  return {
    base: n("base", 0, 10_000),
    speedMax: n("speedMax", 0, 10_000),
    speedCurve: s.speedCurveQuadratic === 1 ? "quadratic" : defaults.speedCurve,
    streakStep: n("streakStep", 0, 1000),
    streakCap: n("streakCap", 0, 10_000),
    hintPenalty: n("hintPenalty", 0, 10_000),
    mistakePenalty: n("mistakePenalty", 0, 10_000),
    difficultyBonusPct: n("difficultyBonusPct", 0, 300),
  };
}

export type AnswerInput = {
  correct: boolean;
  responseMs: number;
  limitMs: number;
  /** Streak including this answer. */
  streak: number;
  level: number;
  hintsUsed?: number;
  mistakes?: number;
};

export type ScoreBreakdown = { base: number; speed: number; streak: number; difficulty: number; hints: number; mistakes: number; total: number };

export function scoreAnswer(cfg: AnswerScoring, a: AnswerInput): ScoreBreakdown {
  if (!a.correct) return { base: 0, speed: 0, streak: 0, difficulty: 0, hints: 0, mistakes: 0, total: 0 };
  const base = cfg.base;
  const speed = speedBonus(a.responseMs, a.limitMs, cfg.speedMax, cfg.speedCurve);
  const streak = streakBonus(a.streak, cfg.streakStep, cfg.streakCap);
  const raw = base + speed + streak;
  const withDifficulty = applyPct(raw, difficultyMultiplier(a.level, cfg.difficultyBonusPct));
  const hints = hintPenalty(a.hintsUsed ?? 0, cfg.hintPenalty);
  const mistakes = mistakePenalty(a.mistakes ?? 0, cfg.mistakePenalty);
  const total = Math.max(0, withDifficulty - hints - mistakes);
  return { base, speed, streak, difficulty: withDifficulty - raw, hints: -hints, mistakes: -mistakes, total };
}

/** Upper bound of scoreAnswer for one answer (used to derive an engine's maxScore). */
export function maxAnswerPoints(cfg: AnswerScoring): number {
  return applyPct(cfg.base + cfg.speedMax + cfg.streakCap, difficultyMultiplier(1, cfg.difficultyBonusPct));
}

/** Adds a breakdown into a running total map (for EngineResult.breakdown). */
export function addBreakdown(acc: Record<string, number>, b: Partial<ScoreBreakdown> | Record<string, number>): Record<string, number> {
  const out = { ...acc };
  for (const [k, v] of Object.entries(b)) if (k !== "total" && typeof v === "number") out[k] = (out[k] ?? 0) + v;
  return out;
}
