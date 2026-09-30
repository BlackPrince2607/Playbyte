import type { GameDefinition } from "../../../core/definition";
import type { EngineMeta, GameEngine, ReduceResult } from "../../../core/engine";
import { Json, Result, err, invalid, ok, valid } from "../../../core/types";
import { interpolate } from "../../../difficulty/controllers";
import type { DifficultyModel, DimensionSpec } from "../../../difficulty/types";
import {
  AnswerScoring,
  DEFAULT_ANSWER_SCORING,
  addBreakdown,
  answerScoring,
  maxAnswerPoints,
  scoreAnswer,
  timeRemainingBonus,
} from "../../../scoring";
import { Difference, SpotParams, inRegion, makeDifferences } from "./differences";
import { ASPECT, Scene, THEMES } from "./scene";

export const SPOT_DIMENSIONS: (DimensionSpec & { key: keyof SpotParams })[] = [
  { key: "diffCount", label: "Differences", easy: 3, hard: 6 },
  { key: "shapeCount", label: "Scene detail", easy: 14, hard: 34 },
  { key: "subtlety", label: "Subtlety", easy: 0, hard: 1 },
  { key: "minSize", label: "Smallest changed object", easy: 0.03, hard: 0.012 },
  { key: "timeLimitMs", label: "Time per picture (ms)", easy: 75_000, hard: 45_000 },
];

export const SPOT_SCORING: AnswerScoring = { ...DEFAULT_ANSWER_SCORING, mistakePenalty: 3, hintPenalty: 5 };
export const CLEAR_BONUS = 50;
/** Extra tolerance around each hit region for finger imprecision. */
export const TOUCH_SLOP = 0.015;

export type SpotAction = { type: "tap"; x: number; y: number };

export type SpotState = {
  v: 1;
  variation: string;
  total: number;
  round: number;
  score: number;
  streak: number;
  correct: number;
  attempts: number;
  misses: number;
  lives: number | null;
  left: Scene;
  right: Scene;
  diffs: Difference[];
  found: string[];
  revealed: string[];
  roundStart: number;
  roundEnd: number;
  roundLimitMs: number;
  lastFindAt: number;
  roundOver: boolean;
  roundMisses: number;
  roundHints: number;
  hintsUsed: number;
  lastTap: { x: number; y: number; ok: boolean; n: number } | null;
  level: number;
  breakdown: Record<string, number>;
  cfg: AnswerScoring;
};

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

function isSpotState(x: unknown): x is SpotState {
  if (!isObj(x) || x.v !== 1) return false;
  const nums = ["total", "round", "score", "streak", "correct", "attempts", "misses", "roundStart", "roundEnd", "roundLimitMs", "level"];
  if (!nums.every((k) => typeof x[k] === "number" && Number.isFinite(x[k] as number))) return false;
  return isObj(x.left) && isObj(x.right) && Array.isArray(x.diffs) && Array.isArray(x.found) && isObj(x.cfg) && typeof x.roundOver === "boolean";
}

export function createSpotEngine(meta: EngineMeta, defaultRounds = 3): GameEngine<SpotState, SpotAction, SpotParams> {
  const difficulty: DifficultyModel<SpotParams> = {
    dimensions: SPOT_DIMENSIONS,
    paramsFor: (level) => interpolate(SPOT_DIMENSIONS, level, ["diffCount", "shapeCount", "timeLimitMs"]) as SpotParams,
    defaultController: "staircase",
  };
  const rounds = (def: GameDefinition) => Math.max(1, Math.min(10, def.roundCount ?? defaultRounds));
  const cfgOf = (def: GameDefinition) => answerScoring(def, SPOT_SCORING);
  const maxDiffs = SPOT_DIMENSIONS.find((d) => d.key === "diffCount")!.hard;
  const finished = (s: SpotState) => s.roundOver && (s.round >= s.total || s.lives === 0);

  function closeRound(s: SpotState, now: number): SpotState {
    const cleared = s.found.length >= s.diffs.length;
    const bonus = cleared ? timeRemainingBonus(s.roundEnd - now, s.roundLimitMs, CLEAR_BONUS) : 0;
    return { ...s, roundOver: true, score: s.score + bonus, breakdown: bonus ? addBreakdown(s.breakdown, { clear: bonus }) : s.breakdown };
  }

  return {
    meta,
    difficulty,

    checkDefinition(def) {
      if (!THEMES[def.variation] || !meta.variations.some((v) => v.id === def.variation)) return err(`spot_difference: unknown variation "${def.variation}"`);
      return ok(def);
    },

    contentNeeds: () => [],

    maxScore: (def) => rounds(def) * (maxDiffs * maxAnswerPoints(cfgOf(def)) + CLEAR_BONUS),

    init(ctx) {
      const empty: Scene = { bg: "#000000", shapes: [] };
      return {
        v: 1,
        variation: ctx.def.variation,
        total: rounds(ctx.def),
        round: 0,
        score: 0,
        streak: 0,
        correct: 0,
        attempts: 0,
        misses: 0,
        lives: ctx.def.lives ?? null,
        left: empty,
        right: empty,
        diffs: [],
        found: [],
        revealed: [],
        roundStart: ctx.now,
        roundEnd: ctx.now,
        roundLimitMs: 0,
        lastFindAt: ctx.now,
        roundOver: false,
        roundMisses: 0,
        roundHints: 0,
        hintsUsed: 0,
        lastTap: null,
        level: ctx.def.difficulty.start,
        breakdown: {},
        cfg: cfgOf(ctx.def),
      };
    },

    generateRound(s, { rng, params, level, now }) {
      let best: ReturnType<typeof makeDifferences> | null = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const base = THEMES[s.variation](rng, params.shapeCount);
        const made = makeDifferences(base, params, rng);
        if (!best || made.diffs.length > best.diffs.length) best = made;
        if (made.diffs.length >= params.diffCount) break;
      }
      const limit = params.timeLimitMs;
      return {
        ...s,
        round: s.round + 1,
        left: best!.left,
        right: best!.right,
        diffs: best!.diffs,
        found: [],
        revealed: [],
        roundStart: now,
        roundEnd: now + limit,
        roundLimitMs: limit,
        lastFindAt: now,
        roundOver: false,
        roundMisses: 0,
        roundHints: 0,
        lastTap: null,
        level,
      };
    },

    validate(s, a) {
      if (s.roundOver) return invalid("round over");
      if (!a || a.type !== "tap" || typeof a.x !== "number" || typeof a.y !== "number") return invalid("bad action");
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || a.x < 0 || a.x > 1 || a.y < 0 || a.y > ASPECT) return invalid("outside picture");
      return valid;
    },

    reduce(s, a, { now }): ReduceResult<SpotState> {
      const n = (s.lastTap?.n ?? 0) + 1;
      const hit = s.diffs.find((d) => !s.found.includes(d.id) && inRegion(d, a.x, a.y, TOUCH_SLOP));
      if (!hit) {
        // Re-tapping an already found difference is harmless.
        if (s.diffs.some((d) => s.found.includes(d.id) && inRegion(d, a.x, a.y, TOUCH_SLOP))) return { state: s };
        const penalty = Math.min(s.score, s.cfg.mistakePenalty);
        let next: SpotState = {
          ...s,
          score: s.score - penalty,
          streak: 0,
          misses: s.misses + 1,
          roundMisses: s.roundMisses + 1,
          attempts: s.attempts + 1,
          lives: s.lives === null ? null : Math.max(0, s.lives - 1),
          lastTap: { x: a.x, y: a.y, ok: false, n },
          breakdown: addBreakdown(s.breakdown, { mistakes: -penalty }),
        };
        if (next.lives === 0) next = closeRound(next, now);
        return { state: next, outcome: { correct: false, responseMs: now - s.lastFindAt, mistakes: 1 } };
      }
      const streak = s.streak + 1;
      const hinted = s.revealed.includes(hit.id) ? 1 : 0;
      const b = scoreAnswer(s.cfg, {
        correct: true,
        responseMs: now - s.lastFindAt,
        limitMs: Math.round(s.roundLimitMs / Math.max(1, s.diffs.length)),
        streak,
        level: s.level,
        hintsUsed: hinted,
      });
      let next: SpotState = {
        ...s,
        score: s.score + b.total,
        streak,
        correct: s.correct + 1,
        attempts: s.attempts + 1,
        found: [...s.found, hit.id],
        lastFindAt: now,
        lastTap: { x: hit.x, y: hit.y, ok: true, n },
        breakdown: addBreakdown(s.breakdown, b),
      };
      if (next.found.length >= next.diffs.length) next = closeRound(next, now);
      return {
        state: next,
        outcome: { correct: true, responseMs: now - s.lastFindAt, points: b.total, hintUsed: hinted > 0 },
        events: [{ name: "spot_found", props: { kind: hit.kind } }],
      };
    },

    tick(s, { now }) {
      if (s.roundOver || now < s.roundEnd) return { state: s };
      return { state: closeRound(s, now), events: [{ name: "spot_timeout", props: { found: s.found.length, of: s.diffs.length } }] };
    },

    hints(s) {
      if (s.roundOver) return [];
      const left = s.diffs.filter((d) => !s.found.includes(d.id) && !s.revealed.includes(d.id));
      return left.length ? [{ id: "reveal", label: "Where?", cost: s.cfg.hintPenalty }] : [];
    },

    applyHint(s, hintId, { rng }) {
      if (hintId !== "reveal" || s.roundOver) return { state: s };
      const left = s.diffs.filter((d) => !s.found.includes(d.id) && !s.revealed.includes(d.id));
      if (!left.length) return { state: s };
      return { state: { ...s, revealed: [...s.revealed, rng.pick(left).id], roundHints: s.roundHints + 1, hintsUsed: s.hintsUsed + 1 } };
    },

    status: (s) => (!s.roundOver ? "playing" : finished(s) ? "gameOver" : "roundOver"),

    progress: (s) => ({
      round: s.round,
      totalRounds: s.total,
      score: s.score,
      streak: s.streak,
      lives: s.lives ?? undefined,
      deadline: s.roundOver ? undefined : s.roundEnd,
    }),

    result: (s) => ({ score: s.score, correct: s.correct, attempts: s.attempts, breakdown: { ...s.breakdown, misses: s.misses } }),

    serialize: (s) => s as unknown as Json,

    restore(json): Result<SpotState> {
      return isSpotState(json) ? ok(json) : err("spot_difference: invalid saved state");
    },
  };
}
