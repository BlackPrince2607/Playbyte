/**
 * Choice: "this or that" against the crowd. Two modes share one engine:
 * - prefer:  pick what you like; points for taking part plus agreement with the crowd.
 * - predict: guess what most people picked; standard answer scoring, close splits are harder.
 * Crowd splits come from content (`attributes.split`, % choosing A) and are refreshed server-side
 * from aggregated `choice_pick` events, so the crowd a player sees is the real one.
 */
import { selectItems } from "../../../content/query";
import type { ContentItem } from "../../../content/types";
import type { GameDefinition } from "../../../core/definition";
import type { EngineMeta, GameEngine, ReduceResult } from "../../../core/engine";
import { Json, Result, err, invalid, ok, valid } from "../../../core/types";
import { interpolate } from "../../../difficulty/controllers";
import type { DifficultyModel, DimensionSpec } from "../../../difficulty/types";
import { AnswerScoring, DEFAULT_ANSWER_SCORING, addBreakdown, answerScoring, maxAnswerPoints, scoreAnswer, streakBonus } from "../../../scoring";
import { pickItem } from "../../quiz/logic/distractors";

export type ChoiceSide = "a" | "b";
export type ChoiceOption = { label: string; emoji?: string };
export type ChoicePair = {
  id: string;
  prompt: string;
  a: ChoiceOption;
  b: ChoiceOption;
  split: number;
  votes: number;
  difficulty: number;
  /** Shown with sides reversed relative to the content item. */
  swapped?: boolean;
};
export type ChoiceMode = "prefer" | "predict";
export type ChoiceParams = { timeLimitMs: number; targetDifficulty: number };
export type ChoiceAction = { type: "pick"; side: ChoiceSide };
export type ChoicePick = { side: ChoiceSide | null; agreePct: number; withCrowd: boolean; points: number; responseMs: number };

export type ChoiceState = {
  v: 1;
  variation: string;
  mode: ChoiceMode;
  total: number;
  round: number;
  score: number;
  streak: number;
  correct: number;
  attempts: number;
  lives: number | null;
  pool: ChoicePair[];
  used: string[];
  q: ChoicePair | null;
  pick: ChoicePick | null;
  roundStart: number;
  deadline: number | null;
  timeLimitMs: number;
  fixedLimitMs: number | null;
  level: number;
  breakdown: Record<string, number>;
  cfg: AnswerScoring;
};

export const CHOICE_DIMENSIONS: (DimensionSpec & { key: keyof ChoiceParams })[] = [
  { key: "timeLimitMs", label: "Time per pick (ms)", easy: 10_000, hard: 5_000 },
  { key: "targetDifficulty", label: "How close the crowd split is", easy: 0.15, hard: 0.85 },
];

/** Prefer mode: every pick earns PARTICIPATION, plus up to AGREEMENT_MAX scaled by the share who agree. */
export const PARTICIPATION = 5;
export const AGREEMENT_MAX = 10;
export const SYNC_STREAK = { step: 1, cap: 5 };

export type ChoiceVariation = { mode: ChoiceMode };

/** Closer splits are harder to predict: 50/50 -> 1, 100/0 -> 0. */
export const splitDifficulty = (split: number) => 1 - Math.abs(split - 50) / 50;

export function pairFromItem(item: ContentItem): ChoicePair | null {
  const at = item.attributes;
  const side = (x: unknown): ChoiceOption | null => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return null;
    const o = x as Record<string, unknown>;
    if (typeof o.label !== "string" || !o.label.trim()) return null;
    return typeof o.emoji === "string" && o.emoji ? { label: o.label, emoji: o.emoji } : { label: o.label };
  };
  const a = side(at.a);
  const b = side(at.b);
  const split = typeof at.split === "number" && Number.isFinite(at.split) ? Math.round(Math.max(0, Math.min(100, at.split))) : null;
  if (!a || !b || split === null || a.label.trim().toLowerCase() === b.label.trim().toLowerCase()) return null;
  const votes = typeof at.votes === "number" && at.votes >= 0 ? Math.round(at.votes) : 0;
  const prompt = typeof at.prompt === "string" && at.prompt.trim() ? at.prompt : item.answer ?? "This or that?";
  return { id: item.id, prompt, a, b, split, votes, difficulty: item.difficulty };
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

function isChoiceState(x: unknown): x is ChoiceState {
  if (!isObj(x) || x.v !== 1) return false;
  const nums = ["total", "round", "score", "streak", "correct", "attempts", "roundStart", "timeLimitMs", "level"];
  if (!nums.every((k) => typeof x[k] === "number" && Number.isFinite(x[k] as number))) return false;
  if (x.mode !== "prefer" && x.mode !== "predict") return false;
  if (!Array.isArray(x.pool) || !Array.isArray(x.used)) return false;
  if (x.q !== null && !(isObj(x.q) && typeof x.q.split === "number" && isObj(x.q.a) && isObj(x.q.b))) return false;
  return (x.pick === null || isObj(x.pick)) && isObj(x.cfg) && isObj(x.breakdown);
}

export type ChoiceEngineSpec = {
  meta: EngineMeta;
  variations: Record<string, ChoiceVariation>;
  defaultRounds?: number;
  poolCap?: number;
};

export function createChoiceEngine(spec: ChoiceEngineSpec): GameEngine<ChoiceState, ChoiceAction, ChoiceParams> {
  const difficulty: DifficultyModel<ChoiceParams> = {
    dimensions: CHOICE_DIMENSIONS,
    paramsFor: (level) => interpolate(CHOICE_DIMENSIONS, level, ["timeLimitMs"]) as ChoiceParams,
    defaultController: "staircase",
  };
  const defaultRounds = spec.defaultRounds ?? 10;
  const poolCap = spec.poolCap ?? 120;
  const rounds = (def: GameDefinition) => Math.max(1, Math.min(30, def.roundCount ?? defaultRounds));
  const cfgOf = (def: GameDefinition) => answerScoring(def, DEFAULT_ANSWER_SCORING);
  const variationOf = (id: string) => spec.variations[id];
  const categoriesFor = (def: GameDefinition) => def.content?.categories ?? (def.category ? [def.category] : spec.meta.variations.find((v) => v.id === def.variation)?.categories);
  const finished = (s: ChoiceState) => s.pick !== null && (s.round >= s.total || s.lives === 0);

  function resolve(s: ChoiceState, side: ChoiceSide | null, now: number): ReduceResult<ChoiceState> {
    const q = s.q!;
    const responseMs = Math.max(0, now - s.roundStart);
    const majority: ChoiceSide[] = q.split > 50 ? ["a"] : q.split < 50 ? ["b"] : ["a", "b"];
    const withCrowd = side !== null && majority.includes(side);
    const agreePct = side === null ? 0 : side === "a" ? q.split : 100 - q.split;
    const streak = withCrowd ? s.streak + 1 : 0;

    let points: number;
    let breakdown: Record<string, number>;
    if (s.mode === "prefer") {
      if (side === null) {
        points = 0;
        breakdown = {};
      } else {
        const agreement = Math.floor((AGREEMENT_MAX * agreePct) / 100);
        const sync = withCrowd ? streakBonus(streak, SYNC_STREAK.step, SYNC_STREAK.cap) : 0;
        points = PARTICIPATION + agreement + sync;
        breakdown = { participation: PARTICIPATION, agreement, streak: sync };
      }
    } else {
      const b = scoreAnswer(s.cfg, { correct: withCrowd, responseMs, limitMs: s.timeLimitMs, streak, level: s.level });
      points = b.total;
      breakdown = b;
    }

    const state: ChoiceState = {
      ...s,
      pick: { side, agreePct, withCrowd, points, responseMs },
      score: s.score + points,
      streak,
      correct: s.correct + (withCrowd ? 1 : 0),
      attempts: s.attempts + 1,
      lives: s.mode === "predict" && s.lives !== null && !withCrowd ? Math.max(0, s.lives - 1) : s.lives,
      deadline: null,
      breakdown: addBreakdown(s.breakdown, breakdown),
    };
    // `vote` is the side of the content item (attributes.a / .b), which is what the server aggregates.
    const vote = side === null ? null : q.swapped ? (side === "a" ? "b" : "a") : side;
    return {
      state,
      outcome: { correct: withCrowd, responseMs, points },
      events: [{ name: side === null ? "choice_timeout" : "choice_pick", props: { item: q.id, side, vote, mode: s.mode, withCrowd } }],
    };
  }

  return {
    meta: spec.meta,
    difficulty,

    checkDefinition(def) {
      const v = spec.meta.variations.find((x) => x.id === def.variation);
      if (!variationOf(def.variation) || !v) return err(`${spec.meta.id}: unknown variation "${def.variation}"`);
      if (v.available === false) return err(`${spec.meta.id}: variation "${def.variation}" is not available`);
      return ok(def);
    },

    contentNeeds: (def) => [{ types: ["choice_pair"], categories: categoriesFor(def), min: 8 }],

    maxScore(def) {
      const v = variationOf(def.variation);
      const perRound = v?.mode === "predict" ? maxAnswerPoints(cfgOf(def)) : PARTICIPATION + AGREEMENT_MAX + SYNC_STREAK.cap;
      return rounds(def) * perRound;
    },

    init(ctx, rng) {
      const v = variationOf(ctx.def.variation)!;
      const items = selectItems(ctx.content, { types: ["choice_pair"], categories: categoriesFor(ctx.def) });
      let pairs = items.map(pairFromItem).filter((p): p is ChoicePair => p !== null);
      if (v.mode === "predict") pairs = pairs.map((p) => ({ ...p, difficulty: splitDifficulty(p.split) }));
      const pool = rng.sample(pairs, poolCap);
      return {
        v: 1,
        variation: ctx.def.variation,
        mode: v.mode,
        total: Math.min(rounds(ctx.def), Math.max(1, pool.length)),
        round: 0,
        score: 0,
        streak: 0,
        correct: 0,
        attempts: 0,
        lives: v.mode === "predict" ? ctx.def.lives ?? null : null,
        pool,
        used: [],
        q: null,
        pick: null,
        roundStart: ctx.now,
        deadline: null,
        timeLimitMs: difficulty.paramsFor(ctx.def.difficulty.start).timeLimitMs,
        fixedLimitMs: ctx.def.timeLimitSec ? Math.round(ctx.def.timeLimitSec * 1000) : null,
        level: ctx.def.difficulty.start,
        breakdown: {},
        cfg: cfgOf(ctx.def),
      };
    },

    generateRound(s, { rng, params, level, now }) {
      const byId = new Map(s.pool.map((p) => [p.id, p]));
      const picked = pickItem(
        s.pool.map((p) => ({ id: p.id, answer: p.a.label, difficulty: p.difficulty, clues: [] })),
        new Set(s.used),
        params.targetDifficulty,
        rng,
      );
      if (!picked) throw new Error(`${spec.meta.id}: no pairs to show`);
      const base = byId.get(picked.id)!;
      // Randomise left/right so the crowd favourite is not always on one side.
      const q = rng.chance(0.5) ? base : { ...base, a: base.b, b: base.a, split: 100 - base.split, swapped: true };
      const timeLimitMs = s.fixedLimitMs ?? params.timeLimitMs;
      return {
        ...s,
        round: s.round + 1,
        q,
        used: [...s.used.filter((id) => id !== q.id), q.id].slice(-Math.max(1, s.pool.length - 1)),
        pick: null,
        roundStart: now,
        timeLimitMs,
        deadline: now + timeLimitMs,
        level,
      };
    },

    validate(s, a) {
      if (!s.q || s.pick) return invalid("no open pair");
      if (!a || a.type !== "pick" || (a.side !== "a" && a.side !== "b")) return invalid("bad action");
      return valid;
    },

    reduce: (s, a, ctx) => resolve(s, a.side, ctx.now),

    tick(s, ctx) {
      if (!s.q || s.pick || s.deadline === null || ctx.now < s.deadline) return { state: s };
      return resolve(s, null, ctx.now);
    },

    hints: () => [],

    status: (s) => (s.pick === null ? "playing" : finished(s) ? "gameOver" : "roundOver"),

    progress: (s) => ({
      round: s.round,
      totalRounds: s.total,
      score: s.score,
      streak: s.streak,
      lives: s.lives ?? undefined,
      deadline: s.deadline ?? undefined,
    }),

    result: (s) => ({ score: s.score, correct: s.correct, attempts: s.attempts, breakdown: s.breakdown }),

    serialize: (s) => s as unknown as Json,

    restore(json): Result<ChoiceState> {
      return isChoiceState(json) ? ok(json) : err(`${spec.meta.id}: invalid saved state`);
    },
  };
}
