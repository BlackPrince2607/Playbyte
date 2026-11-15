import type { GameDefinition } from "../../../core/definition";
import type { GameEngine, ReduceResult } from "../../../core/engine";
import type { Rng } from "../../../core/rng";
import { err, invalid, ok, valid } from "../../../core/types";
import { interpolate } from "../../../difficulty/controllers";
import type { DifficultyModel, DimensionSpec } from "../../../difficulty/types";
import { addBreakdown, applyPct, difficultyMultiplier, streakBonus, timeRemainingBonus } from "../../../scoring";
import { memoryMeta } from "../meta";
import {
  DEFAULT_LIMIT_MS,
  FACE_THEMES,
  FLIP_BACK_MS,
  MATCH_POINTS,
  MISMATCH_PENALTY,
  PAIR_COUNT,
  STREAK_CAP,
  STREAK_STEP,
  THEME_IDS,
  TIME_BONUS,
} from "./faces";

export type MemoryParams = { timeLimitMs: number };
export type MemoryAction = { type: "flip"; index: number };

export type MemoryCard = {
  id: number;
  face: string;
  faceUp: boolean;
  matched: boolean;
};

export type MemoryState = {
  v: 1;
  variation: string;
  total: number;
  round: number;
  score: number;
  streak: number;
  correct: number;
  attempts: number;
  matches: number;
  mismatches: number;
  theme: string;
  cards: MemoryCard[];
  firstIndex: number | null;
  lockUntil: number | null;
  roundStart: number;
  roundEnd: number;
  roundLimitMs: number;
  roundOver: boolean;
  cleared: boolean;
  level: number;
  breakdown: Record<string, number>;
  /** Catalog time override (ms); set in init from definition.timeLimitSec. */
  fixedLimitMs: number | null;
  themeHint: string | null;
};

export const MEMORY_DIMENSIONS: (DimensionSpec & { key: keyof MemoryParams })[] = [
  { key: "timeLimitMs", label: "Time limit (ms)", easy: 50_000, hard: 30_000 },
];

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

function isMemoryState(x: unknown): x is MemoryState {
  if (!isObj(x) || x.v !== 1) return false;
  const nums = ["total", "round", "score", "streak", "correct", "attempts", "matches", "mismatches", "roundStart", "roundEnd", "roundLimitMs", "level"];
  if (!nums.every((k) => typeof x[k] === "number" && Number.isFinite(x[k] as number))) return false;
  return Array.isArray(x.cards) && typeof x.roundOver === "boolean" && typeof x.theme === "string";
}

export function deal(rng: Rng, themeId?: string | null): { theme: string; cards: MemoryCard[] } {
  const theme = themeId && FACE_THEMES[themeId] ? themeId : rng.pick(THEME_IDS);
  const faces = rng.shuffle([...FACE_THEMES[theme]]).slice(0, PAIR_COUNT);
  const deck = rng.shuffle(faces.flatMap((face) => [face, face]));
  return {
    theme,
    cards: deck.map((face, id) => ({ id, face, faceUp: false, matched: false })),
  };
}

export function limitMsFor(def: GameDefinition | null | undefined, params: MemoryParams, fixedLimitMs: number | null): number {
  if (fixedLimitMs && fixedLimitMs > 0) return fixedLimitMs;
  if (def?.timeLimitSec && def.timeLimitSec > 0) return Math.round(def.timeLimitSec * 1000);
  return Math.round(params.timeLimitMs || DEFAULT_LIMIT_MS);
}

function close(s: MemoryState, now: number, cleared: boolean): ReduceResult<MemoryState> {
  const b: Record<string, number> = {};
  let points = 0;
  if (cleared) {
    const time = timeRemainingBonus(s.roundEnd - now, s.roundLimitMs, TIME_BONUS);
    points = time;
    Object.assign(b, { time });
  }
  return {
    state: {
      ...s,
      roundOver: true,
      cleared,
      firstIndex: null,
      lockUntil: null,
      score: s.score + points,
      breakdown: addBreakdown(s.breakdown, b),
    },
    outcome: {
      correct: cleared,
      responseMs: Math.max(0, now - s.roundStart),
      points,
      mistakes: s.mismatches,
    },
    events: [{ name: cleared ? "memory_cleared" : "memory_timeout", props: { matches: s.matches, mismatches: s.mismatches, theme: s.theme } }],
  };
}

const difficulty: DifficultyModel<MemoryParams> = {
  dimensions: MEMORY_DIMENSIONS,
  paramsFor: (level) => interpolate(MEMORY_DIMENSIONS, level, ["timeLimitMs"]) as MemoryParams,
  defaultController: "fixed",
};

export const memoryEngine: GameEngine<MemoryState, MemoryAction, MemoryParams> = {
  meta: memoryMeta,
  difficulty,

  checkDefinition(def) {
    const v = memoryMeta.variations.find((x) => x.id === def.variation);
    if (!v) return err(`memory: unknown variation "${def.variation}"`);
    if (v.available === false) return err(`memory: variation "${def.variation}" is not available`);
    return ok(def);
  },

  contentNeeds: () => [],

  maxScore(def) {
    const matchMax = PAIR_COUNT * (applyPct(MATCH_POINTS, difficultyMultiplier(1)) + STREAK_CAP);
    return Math.max(def.maxScore ?? 0, matchMax + TIME_BONUS);
  },

  init(ctx) {
    const themeHint = typeof ctx.def.rules?.theme === "string" ? String(ctx.def.rules.theme) : null;
    return {
      v: 1,
      variation: ctx.def.variation,
      total: 1,
      round: 0,
      score: 0,
      streak: 0,
      correct: 0,
      attempts: 0,
      matches: 0,
      mismatches: 0,
      theme: "",
      cards: [],
      firstIndex: null,
      lockUntil: null,
      roundStart: ctx.now,
      roundEnd: ctx.now,
      roundLimitMs: 0,
      roundOver: false,
      cleared: false,
      level: ctx.def.difficulty.start,
      breakdown: {},
      fixedLimitMs: ctx.def.timeLimitSec ? Math.round(ctx.def.timeLimitSec * 1000) : null,
      themeHint,
    };
  },

  generateRound(s, { rng, params, level, now }) {
    const { theme, cards } = deal(rng, s.themeHint);
    const limit = limitMsFor(null, params, s.fixedLimitMs);
    return {
      ...s,
      round: s.round + 1,
      theme,
      cards,
      firstIndex: null,
      lockUntil: null,
      matches: 0,
      mismatches: 0,
      streak: 0,
      roundStart: now,
      roundEnd: now + limit,
      roundLimitMs: limit,
      roundOver: false,
      cleared: false,
      level,
    };
  },

  validate(s, a) {
    if (s.roundOver) return invalid("round over");
    if (!a || a.type !== "flip" || !Number.isInteger(a.index)) return invalid("bad action");
    if (a.index < 0 || a.index >= s.cards.length) return invalid("out of range");
    if (s.lockUntil !== null) return invalid("locked");
    const card = s.cards[a.index];
    if (card.matched || card.faceUp) return invalid("already open");
    return valid;
  },

  reduce(s, a, { now }) {
    if (s.lockUntil !== null || s.roundOver) return { state: s };

    const cards = s.cards.map((c) => ({ ...c }));
    cards[a.index] = { ...cards[a.index], faceUp: true };

    if (s.firstIndex === null) {
      return {
        state: { ...s, cards, firstIndex: a.index },
        events: [{ name: "memory_flip", props: { index: a.index } }],
      };
    }

    const first = s.firstIndex;
    const match = cards[first].face === cards[a.index].face;
    if (match) {
      cards[first] = { ...cards[first], matched: true, faceUp: true };
      cards[a.index] = { ...cards[a.index], matched: true, faceUp: true };
      const streak = s.streak + 1;
      const basePts = applyPct(MATCH_POINTS, difficultyMultiplier(s.level));
      const bonus = streakBonus(streak, STREAK_STEP, STREAK_CAP);
      const points = basePts + bonus;
      const matches = s.matches + 1;
      const next: MemoryState = {
        ...s,
        cards,
        firstIndex: null,
        lockUntil: null,
        streak,
        matches,
        score: s.score + points,
        correct: s.correct + 1,
        attempts: s.attempts + 1,
        breakdown: addBreakdown(s.breakdown, { match: basePts, streak: bonus }),
      };
      const events = [{ name: "memory_match", props: { face: cards[a.index].face, matches } }];
      if (matches >= PAIR_COUNT) {
        const closed = close(next, now, true);
        return {
          ...closed,
          events: [...events, ...(closed.events ?? [])],
          outcome: {
            correct: true,
            responseMs: Math.max(0, now - s.roundStart),
            points: points + (closed.outcome?.points ?? 0),
          },
        };
      }
      return { state: next, outcome: { correct: true, responseMs: Math.max(0, now - s.roundStart), points }, events };
    }

    return {
      state: {
        ...s,
        cards,
        firstIndex: null,
        lockUntil: now + FLIP_BACK_MS,
        streak: 0,
        mismatches: s.mismatches + 1,
        attempts: s.attempts + 1,
        score: Math.max(0, s.score - MISMATCH_PENALTY),
        breakdown: addBreakdown(s.breakdown, { mismatch: -MISMATCH_PENALTY }),
      },
      outcome: { correct: false, responseMs: Math.max(0, now - s.roundStart), mistakes: 1, points: -MISMATCH_PENALTY },
      events: [{ name: "memory_mismatch", props: { a: first, b: a.index } }],
    };
  },

  tick(s, { now }) {
    if (s.roundOver) return { state: s };
    if (s.lockUntil !== null && now >= s.lockUntil) {
      return {
        state: {
          ...s,
          lockUntil: null,
          cards: s.cards.map((c) => (c.matched ? c : { ...c, faceUp: false })),
        },
      };
    }
    if (now >= s.roundEnd) return close(s, now, s.matches >= PAIR_COUNT);
    return { state: s };
  },

  hints: () => [],

  status(s) {
    if (s.roundOver) return "gameOver";
    return "playing";
  },

  progress(s) {
    return {
      round: Math.max(1, s.round),
      totalRounds: s.total,
      score: s.score,
      streak: s.streak,
      deadline: s.roundOver ? undefined : s.roundEnd,
    };
  },

  result(s) {
    return { score: s.score, correct: s.correct, attempts: s.attempts, breakdown: s.breakdown };
  },

  serialize: (s) => s,
  restore: (json) => (isMemoryState(json) ? ok(json) : err("memory: invalid saved state")),
};
