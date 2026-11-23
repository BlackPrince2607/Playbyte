import type { EngineEvent, EngineMeta, GameEngine } from "../../../core/engine";
import { Json, Result, err, invalid, ok, valid } from "../../../core/types";
import { interpolate } from "../../../difficulty/controllers";
import type { DifficultyModel, DimensionSpec } from "../../../difficulty/types";
import { addBreakdown, applyPct, difficultyMultiplier, streakBonus } from "../../../scoring";
import { Cell, Dir, arrowCount, generateBoard, isCell, isFree } from "./board";

export type ArrowParams = { size: number; fill: number };
export type ArrowAction = { type: "tap"; index: number };

export type ArrowState = {
  v: 2;
  variation: string;
  round: number;
  score: number;
  streak: number;
  bestStreak: number;
  cleared: number;
  attempts: number;
  misses: number;
  /** Arrows on the board when the round started (for progress UI). */
  total: number;
  cols: number;
  rows: number;
  fill: number;
  cells: Cell[];
  /** Last tap, so the view can flash a blocked arrow. */
  flash: { index: number; ok: boolean } | null;
  lastAt: number;
  roundStart: number;
  /** Extra ms added to finish time for blocked taps. */
  penaltyMs: number;
  /** Wall+penalty ms when the board cleared; null while playing. */
  finishMs: number | null;
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
export const CLEAR_BONUS = 40;
export const BLOCK_MS = 1000;
/** Platform score = this minus finish ms, so faster clears rank higher. */
export const TIME_SCORE_CAP = 180_000;

export type ArrowVariation = {
  /** Added to difficulty size before clamping (harder boards). */
  sizeBoost?: number;
  /** Added to fill density (harder boards). */
  fillBoost?: number;
};

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

function isArrowState(x: unknown): x is ArrowState {
  if (!isObj(x) || x.v !== 2 || typeof x.variation !== "string") return false;
  const nums = ["round", "score", "streak", "bestStreak", "cleared", "attempts", "misses", "total", "cols", "rows", "fill", "lastAt", "roundStart", "penaltyMs", "level"];
  if (!nums.every((k) => typeof x[k] === "number" && Number.isFinite(x[k] as number))) return false;
  if (typeof x.roundOver !== "boolean" || !Array.isArray(x.cells)) return false;
  if (x.finishMs !== null && (typeof x.finishMs !== "number" || !Number.isFinite(x.finishMs))) return false;
  const cols = x.cols as number;
  const rows = x.rows as number;
  if (cols < 1 || rows < 1 || x.cells.length !== cols * rows) return false;
  if (!x.cells.every(isCell)) return false;
  const flash = x.flash;
  if (flash !== null && (!isObj(flash) || typeof flash.index !== "number" || typeof flash.ok !== "boolean")) return false;
  return isObj(x.breakdown);
}

export function maxArrowScore(): number {
  // Theoretical ceiling: near-instant clear of a dense 6×6 with full streak + clear bonus.
  const taps = 36;
  const per = applyPct(ARROW_POINTS + STREAK_CAP, difficultyMultiplier(1));
  return taps * per + CLEAR_BONUS + TIME_SCORE_CAP;
}

export function finishScore(finishMs: number): number {
  return Math.max(0, TIME_SCORE_CAP - Math.max(0, Math.round(finishMs)));
}

export function createArrowEngine(meta: EngineMeta, variations: Record<string, ArrowVariation>): GameEngine<ArrowState, ArrowAction, ArrowParams> {
  const difficulty: DifficultyModel<ArrowParams> = {
    dimensions: ARROW_DIMENSIONS,
    paramsFor: (level) => interpolate(ARROW_DIMENSIONS, level, ["size"]) as ArrowParams,
    defaultController: "staircase",
  };
  const vOf = (id: string) => variations[id];

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

    maxScore: () => maxArrowScore(),

    init(ctx) {
      return {
        v: 2,
        variation: ctx.def.variation,
        round: 0,
        score: 0,
        streak: 0,
        bestStreak: 0,
        cleared: 0,
        attempts: 0,
        misses: 0,
        total: 0,
        cols: 0,
        rows: 0,
        fill: 0,
        cells: [],
        flash: null,
        lastAt: ctx.now,
        roundStart: ctx.now,
        penaltyMs: 0,
        finishMs: null,
        roundOver: false,
        level: ctx.def.difficulty.start,
        breakdown: {},
      };
    },

    generateRound(s, { rng, params, level, now }) {
      const v = vOf(s.variation) ?? {};
      const size = Math.max(4, Math.min(6, Math.round(params.size + (v.sizeBoost ?? 0))));
      const cols = size;
      const rows = size;
      const fill = Math.round(Math.min(0.85, params.fill + (v.fillBoost ?? 0)) * 100) / 100;
      const cells = generateBoard(rng, cols, rows, fill);
      return {
        ...s,
        round: s.round + 1,
        cols,
        rows,
        fill,
        cells,
        total: arrowCount(cells),
        flash: null,
        streak: 0,
        lastAt: now,
        roundStart: now,
        penaltyMs: 0,
        finishMs: null,
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

    reduce(s, a, { now }) {
      const dir = s.cells[a.index] as Dir;
      if (!isFree(s.cells, s.cols, s.rows, a.index)) {
        return {
          state: {
            ...s,
            misses: s.misses + 1,
            attempts: s.attempts + 1,
            streak: 0,
            lastAt: now,
            penaltyMs: s.penaltyMs + BLOCK_MS,
            flash: { index: a.index, ok: false },
          },
          outcome: { correct: false, responseMs: Math.max(0, now - s.lastAt), mistakes: 1 },
          events: [{ name: "arrow_blocked", props: { index: a.index, dir } }],
        };
      }

      const cells = s.cells.slice();
      cells[a.index] = null;
      const streak = s.streak + 1;
      const base = applyPct(ARROW_POINTS, difficultyMultiplier(s.level));
      const streakPts = streakBonus(streak, STREAK_STEP, STREAK_CAP);
      const remaining = arrowCount(cells);
      const clearedBoard = remaining === 0;
      let clearBonus = 0;
      let timePts = 0;
      let finishMs: number | null = null;
      let roundOver = false;
      const events: EngineEvent[] = [{ name: "arrow_clear", props: { index: a.index, dir } }];

      if (clearedBoard) {
        finishMs = Math.max(0, now - s.roundStart) + s.penaltyMs;
        clearBonus = CLEAR_BONUS;
        timePts = finishScore(finishMs);
        roundOver = true;
        events.push({ name: "arrow_board", props: { finishMs, penaltyMs: s.penaltyMs } });
      }

      const points = base + streakPts + clearBonus + timePts;
      const breakdown = addBreakdown(s.breakdown, {
        base,
        streak: streakPts,
        ...(clearBonus ? { clear: clearBonus } : {}),
        ...(timePts ? { speed: timePts } : {}),
      });

      return {
        state: {
          ...s,
          cells,
          cleared: s.cleared + 1,
          attempts: s.attempts + 1,
          streak,
          bestStreak: Math.max(s.bestStreak, streak),
          score: s.score + points,
          lastAt: now,
          flash: { index: a.index, ok: true },
          finishMs,
          roundOver,
          breakdown,
        },
        outcome: { correct: true, responseMs: Math.max(0, now - s.lastAt), points },
        events,
      };
    },

    tick(s) {
      return { state: s };
    },

    hints: () => [],

    status: (s) => (s.roundOver ? "gameOver" : "playing"),

    progress: (s) => ({
      round: Math.max(1, s.round),
      totalRounds: 1,
      score: s.score,
      streak: s.streak,
      deadline: undefined,
    }),

    result: (s) => ({
      score: s.score,
      correct: s.cleared,
      attempts: s.attempts,
      breakdown: {
        ...s.breakdown,
        cleared: s.cleared,
        ...(s.misses ? { blocked: s.misses } : {}),
        ...(s.finishMs != null ? { finishMs: s.finishMs } : {}),
        ...(s.penaltyMs ? { penaltyMs: s.penaltyMs } : {}),
        ...(s.bestStreak ? { bestStreak: s.bestStreak } : {}),
      },
    }),

    serialize: (s) => s as unknown as Json,

    restore(json): Result<ArrowState> {
      return isArrowState(json) ? ok(json) : err("arrow_puzzle: invalid saved state");
    },
  };
}
