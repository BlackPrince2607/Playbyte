import type { EngineEvent, EngineMeta, GameEngine, ReduceResult } from "../../../core/engine";
import { Json, Result, err, invalid, ok, valid } from "../../../core/types";
import { interpolate } from "../../../difficulty/controllers";
import type { DifficultyModel, DimensionSpec } from "../../../difficulty/types";
import { addBreakdown, applyPct, difficultyMultiplier, streakBonus } from "../../../scoring";
import { Cell, Dir, arrowCount, generateBoard, isCell, isFree, nextBoardSize } from "./board";

export type ArrowParams = { size: number; fill: number };
export type ArrowAction = { type: "tap"; index: number };

export type ArrowState = {
  v: 1;
  variation: string;
  round: number;
  score: number;
  streak: number;
  bestStreak: number;
  cleared: number;
  attempts: number;
  misses: number;
  boards: number;
  cols: number;
  rows: number;
  fill: number;
  cells: Cell[];
  /** Last tap, so the view can flash a blocked arrow. */
  flash: { index: number; ok: boolean } | null;
  limitMs: number;
  lastAt: number;
  roundStart: number;
  roundEnd: number;
  roundLimitMs: number;
  roundOver: boolean;
  level: number;
  breakdown: Record<string, number>;
};

export const ARROW_DIMENSIONS: (DimensionSpec & { key: keyof ArrowParams })[] = [
  { key: "size", label: "Board width", easy: 5, hard: 6 },
  { key: "fill", label: "Arrow density", easy: 0.62, hard: 0.78 },
];

export const ARROW_POINTS = 10;
export const STREAK_STEP = 1;
export const STREAK_CAP = 5;
export const BOARD_BONUS = 40;
export const BLOCK_MS = 1000;

/** Fastest plausible tap, and the smallest board, used only to cap the theoretical score. */
const MIN_TAP_MS = 120;
const MIN_BOARD_ARROWS = 8;

export type ArrowVariation = { durationMs: number };

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

function isArrowState(x: unknown): x is ArrowState {
  if (!isObj(x) || x.v !== 1 || typeof x.variation !== "string") return false;
  const nums = ["round", "score", "streak", "bestStreak", "cleared", "attempts", "misses", "boards", "cols", "rows", "fill", "limitMs", "lastAt", "roundStart", "roundEnd", "roundLimitMs", "level"];
  if (!nums.every((k) => typeof x[k] === "number" && Number.isFinite(x[k] as number))) return false;
  if (typeof x.roundOver !== "boolean" || !Array.isArray(x.cells)) return false;
  const cols = x.cols as number;
  const rows = x.rows as number;
  if (cols < 1 || rows < 1 || x.cells.length !== cols * rows) return false;
  if (!x.cells.every(isCell)) return false;
  const flash = x.flash;
  if (flash !== null && (!isObj(flash) || typeof flash.index !== "number" || typeof flash.ok !== "boolean")) return false;
  return isObj(x.breakdown);
}

export function maxArrowScore(durationMs: number): number {
  const taps = Math.floor(durationMs / MIN_TAP_MS);
  const per = applyPct(ARROW_POINTS + STREAK_CAP, difficultyMultiplier(1));
  const boards = Math.ceil(taps / MIN_BOARD_ARROWS);
  return taps * per + boards * BOARD_BONUS;
}

export function createArrowEngine(meta: EngineMeta, variations: Record<string, ArrowVariation>): GameEngine<ArrowState, ArrowAction, ArrowParams> {
  const difficulty: DifficultyModel<ArrowParams> = {
    dimensions: ARROW_DIMENSIONS,
    paramsFor: (level) => interpolate(ARROW_DIMENSIONS, level, ["size"]) as ArrowParams,
    defaultController: "staircase",
  };
  const vOf = (id: string) => variations[id];

  function close(s: ArrowState): ReduceResult<ArrowState> {
    return {
      state: { ...s, roundOver: true, flash: null, streak: 0 },
      outcome: { correct: false, responseMs: 0, mistakes: 1 },
      events: [{ name: "arrow_timeout", props: { cleared: s.cleared, boards: s.boards } }],
    };
  }

  return {
    meta,
    difficulty,

    checkDefinition(def) {
      const v = meta.variations.find((x) => x.id === def.variation);
      if (!vOf(def.variation) || !v) return err(`arrow_puzzle: unknown variation "${def.variation}"`);
      if (v.available === false) return err(`arrow_puzzle: variation "${def.variation}" is not available`);
      return ok(def);
    },

    contentNeeds: () => [],

    maxScore(def) {
      const v = vOf(def.variation);
      return v ? maxArrowScore(v.durationMs) : 1;
    },

    init(ctx) {
      const v = vOf(ctx.def.variation);
      const limitMs = Math.round((ctx.def.timeLimitSec ?? v.durationMs / 1000) * 1000);
      return {
        v: 1,
        variation: ctx.def.variation,
        round: 0,
        score: 0,
        streak: 0,
        bestStreak: 0,
        cleared: 0,
        attempts: 0,
        misses: 0,
        boards: 0,
        cols: 0,
        rows: 0,
        fill: 0,
        cells: [],
        flash: null,
        limitMs,
        lastAt: ctx.now,
        roundStart: ctx.now,
        roundEnd: ctx.now,
        roundLimitMs: limitMs,
        roundOver: false,
        level: ctx.def.difficulty.start,
        breakdown: {},
      };
    },

    generateRound(s, { rng, params, level, now }) {
      const size = Math.max(4, Math.min(6, Math.round(params.size)));
      const cols = size;
      const rows = size;
      const fill = Math.round(params.fill * 100) / 100;
      return {
        ...s,
        round: s.round + 1,
        cols,
        rows,
        fill,
        cells: generateBoard(rng, cols, rows, fill),
        flash: null,
        streak: 0,
        lastAt: now,
        roundStart: now,
        roundEnd: now + s.limitMs,
        roundLimitMs: s.limitMs,
        roundOver: false,
        level,
      };
    },

    validate(s, a) {
      if (s.roundOver) return invalid("round over");
      if (!a || a.type !== "tap" || !Number.isInteger(a.index)) return invalid("bad action");
      if (a.index < 0 || a.index >= s.cells.length) return invalid("off board");
      if (s.cells[a.index] == null) return invalid("empty cell");
      return valid;
    },

    reduce(s, a, { rng, now }) {
      const dir = s.cells[a.index] as Dir;
      if (!isFree(s.cells, s.cols, s.rows, a.index)) {
        const roundEnd = s.roundEnd - BLOCK_MS;
        const over = roundEnd <= now;
        return {
          state: {
            ...s,
            misses: s.misses + 1,
            attempts: s.attempts + 1,
            streak: 0,
            lastAt: now,
            roundEnd: over ? now : roundEnd,
            roundOver: over,
            flash: over ? null : { index: a.index, ok: false },
          },
          outcome: { correct: false, responseMs: Math.max(0, now - s.lastAt), mistakes: 1 },
          events: [{ name: over ? "arrow_timeout" : "arrow_blocked", props: { index: a.index, dir } }],
        };
      }

      const cells = s.cells.slice();
      cells[a.index] = null;
      const streak = s.streak + 1;
      const base = applyPct(ARROW_POINTS, difficultyMultiplier(s.level));
      const streakPts = streakBonus(streak, STREAK_STEP, STREAK_CAP);
      let boardBonus = 0;
      let cols = s.cols;
      let rows = s.rows;
      let fill = s.fill;
      let boards = s.boards;
      let nextCells = cells;
      if (arrowCount(cells) === 0) {
        boards += 1;
        boardBonus = BOARD_BONUS;
        const grown = nextBoardSize(cols, rows, fill, boards);
        cols = grown.cols;
        rows = grown.rows;
        fill = grown.fill;
        nextCells = generateBoard(rng, cols, rows, fill);
      }
      const points = base + streakPts + boardBonus;
      const breakdown = addBreakdown(s.breakdown, { base, streak: streakPts, ...(boardBonus ? { clear: boardBonus } : {}) });
      const events: EngineEvent[] = [{ name: "arrow_clear", props: { index: a.index, dir } }];
      if (boardBonus) events.push({ name: "arrow_board", props: { boards } });
      return {
        state: {
          ...s,
          cells: nextCells,
          cols,
          rows,
          fill,
          boards,
          cleared: s.cleared + 1,
          attempts: s.attempts + 1,
          streak,
          bestStreak: Math.max(s.bestStreak, streak),
          score: s.score + points,
          lastAt: now,
          flash: { index: a.index, ok: true },
          breakdown,
        },
        outcome: { correct: true, responseMs: Math.max(0, now - s.lastAt), points },
        events,
      };
    },

    tick(s, { now }) {
      if (s.roundOver || now < s.roundEnd) return { state: s };
      return close(s);
    },

    hints: () => [],

    status: (s) => (s.roundOver ? "gameOver" : "playing"),

    progress: (s) => ({
      round: Math.max(1, s.round),
      totalRounds: null,
      score: s.score,
      streak: s.streak,
      deadline: s.roundOver ? undefined : s.roundEnd,
    }),

    result: (s) => ({
      score: s.score,
      correct: s.cleared,
      attempts: s.attempts,
      breakdown: {
        ...s.breakdown,
        cleared: s.cleared,
        ...(s.misses ? { blocked: s.misses } : {}),
        ...(s.boards ? { boards: s.boards } : {}),
        ...(s.bestStreak ? { bestStreak: s.bestStreak } : {}),
      },
    }),

    serialize: (s) => s as unknown as Json,

    restore(json): Result<ArrowState> {
      return isArrowState(json) ? ok(json) : err("arrow_puzzle: invalid saved state");
    },
  };
}
