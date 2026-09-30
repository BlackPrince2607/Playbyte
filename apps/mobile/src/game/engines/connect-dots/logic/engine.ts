import type { GameDefinition } from "../../../core/definition";
import type { EngineMeta, GameEngine, ReduceResult } from "../../../core/engine";
import { Json, Result, err, invalid, ok, valid } from "../../../core/types";
import { interpolate } from "../../../difficulty/controllers";
import type { DifficultyModel, DimensionSpec } from "../../../difficulty/types";
import { addBreakdown, applyPct, difficultyMultiplier, timeRemainingBonus } from "../../../scoring";
import { adjacent, generateBoard } from "./board";

export type ConnectParams = { size: number; pairDensity: number; timePerCellMs: number };
export type ConnectAction =
  | { type: "draw"; color: number; cells: number[]; stroke?: boolean }
  | { type: "clear"; color: number };

export type ConnectState = {
  v: 1;
  variation: string;
  total: number;
  round: number;
  score: number;
  streak: number;
  correct: number;
  attempts: number;
  lives: number | null;
  size: number;
  pairs: [number, number][];
  /** Colour index of the dot on each cell, or -1. */
  dots: number[];
  /** One path per colour; always starts at one of that colour's dots. */
  paths: number[][];
  solution: number[][];
  moves: number;
  roundHints: number;
  hintsUsed: number;
  roundStart: number;
  roundEnd: number;
  roundLimitMs: number;
  roundOver: boolean;
  solved: boolean;
  perfect: boolean;
  level: number;
  breakdown: Record<string, number>;
};

export const CONNECT_DIMENSIONS: (DimensionSpec & { key: keyof ConnectParams })[] = [
  { key: "size", label: "Board size", easy: 5, hard: 9 },
  { key: "pairDensity", label: "Pairs per row", easy: 1, hard: 0.75 },
  { key: "timePerCellMs", label: "Time per cell (ms)", easy: 3000, hard: 1500 },
];

export const SOLVE_POINTS = 60;
export const TIME_BONUS = 40;
export const PERFECT_BONUS = 20;
export const EFFICIENCY_BONUS = 20;
export const HINT_PENALTY = 10;

export type ConnectVariation = { rounds: number; sizeDelta?: number; timeScale?: number };

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

function isConnectState(x: unknown): x is ConnectState {
  if (!isObj(x) || x.v !== 1) return false;
  const nums = ["total", "round", "score", "size", "moves", "roundStart", "roundEnd", "roundLimitMs", "level"];
  if (!nums.every((k) => typeof x[k] === "number" && Number.isFinite(x[k] as number))) return false;
  return Array.isArray(x.pairs) && Array.isArray(x.dots) && Array.isArray(x.paths) && Array.isArray(x.solution) && typeof x.roundOver === "boolean";
}

export const isConnected = (s: Pick<ConnectState, "pairs" | "paths">, color: number) => {
  const p = s.paths[color];
  const [a, b] = s.pairs[color];
  return p.length >= 2 && ((p[0] === a && p[p.length - 1] === b) || (p[0] === b && p[p.length - 1] === a));
};

export const filledCells = (s: Pick<ConnectState, "paths" | "dots">) => {
  const set = new Set<number>();
  s.dots.forEach((d, i) => d >= 0 && set.add(i));
  for (const p of s.paths) for (const c of p) set.add(c);
  return set.size;
};

/** Sets colour `color`'s path, cutting any other path it crosses (the crossed path keeps its start). */
function withPath(s: ConnectState, color: number, cells: number[]): number[][] {
  const taken = new Set(cells);
  return s.paths.map((p, k) => {
    if (k === color) return cells;
    const cut = p.findIndex((c) => taken.has(c));
    return cut < 0 ? p : p.slice(0, cut);
  });
}

export function createConnectEngine(meta: EngineMeta, variations: Record<string, ConnectVariation>): GameEngine<ConnectState, ConnectAction, ConnectParams> {
  const difficulty: DifficultyModel<ConnectParams> = {
    dimensions: CONNECT_DIMENSIONS,
    paramsFor: (level) => interpolate(CONNECT_DIMENSIONS, level, ["size", "timePerCellMs"]) as ConnectParams,
    defaultController: "staircase",
  };
  const vOf = (id: string) => variations[id];
  const rounds = (def: GameDefinition) => Math.max(1, Math.min(10, def.roundCount ?? vOf(def.variation).rounds));
  const finished = (s: ConnectState) => s.roundOver && (s.round >= s.total || s.lives === 0);

  function close(s: ConnectState, now: number, solved: boolean): ReduceResult<ConnectState> {
    const b: Record<string, number> = {};
    let points = 0;
    const perfect = solved && filledCells(s) === s.size * s.size;
    if (solved) {
      const base = applyPct(SOLVE_POINTS, difficultyMultiplier(s.level));
      const time = timeRemainingBonus(s.roundEnd - now, s.roundLimitMs, TIME_BONUS);
      const fill = perfect ? PERFECT_BONUS : 0;
      const eff = Math.floor((EFFICIENCY_BONUS * Math.min(s.pairs.length, Math.max(1, s.moves))) / Math.max(1, s.moves));
      const hints = Math.min(base + time + fill + eff, s.roundHints * HINT_PENALTY);
      points = base + time + fill + eff - hints;
      Object.assign(b, { base, time, perfect: fill, efficiency: eff, hints: -hints });
    }
    const streak = solved ? s.streak + 1 : 0;
    return {
      state: {
        ...s,
        roundOver: true,
        solved,
        perfect,
        score: s.score + points,
        streak,
        correct: s.correct + (solved ? 1 : 0),
        attempts: s.attempts + 1,
        lives: solved || s.lives === null ? s.lives : Math.max(0, s.lives - 1),
        breakdown: addBreakdown(s.breakdown, b),
      },
      outcome: { correct: solved, responseMs: Math.max(0, now - s.roundStart), points, hintUsed: s.roundHints > 0 },
      events: [{ name: solved ? "connect_solved" : "connect_timeout", props: { size: s.size, pairs: s.pairs.length, moves: s.moves, perfect } }],
    };
  }

  function afterChange(prev: ConnectState, next: ConnectState, now: number): ReduceResult<ConnectState> {
    const newly = next.pairs.map((_, k) => k).filter((k) => isConnected(next, k) && !isConnected(prev, k));
    const events = newly.map((k) => ({ name: "connect_pair", props: { color: k } as Record<string, Json> }));
    if (next.pairs.every((_, k) => isConnected(next, k))) {
      const r = close(next, now, true);
      return { ...r, events: [...events, ...(r.events ?? [])] };
    }
    return { state: next, events };
  }

  return {
    meta,
    difficulty,

    checkDefinition(def) {
      const v = meta.variations.find((x) => x.id === def.variation);
      if (!vOf(def.variation) || !v) return err(`connect_dots: unknown variation "${def.variation}"`);
      if (v.available === false) return err(`connect_dots: variation "${def.variation}" is not available`);
      return ok(def);
    },

    contentNeeds: () => [],

    maxScore: (def) => rounds(def) * (applyPct(SOLVE_POINTS, difficultyMultiplier(1)) + TIME_BONUS + PERFECT_BONUS + EFFICIENCY_BONUS),

    init(ctx) {
      return {
        v: 1,
        variation: ctx.def.variation,
        total: rounds(ctx.def),
        round: 0,
        score: 0,
        streak: 0,
        correct: 0,
        attempts: 0,
        lives: ctx.def.lives ?? null,
        size: 0,
        pairs: [],
        dots: [],
        paths: [],
        solution: [],
        moves: 0,
        roundHints: 0,
        hintsUsed: 0,
        roundStart: ctx.now,
        roundEnd: ctx.now,
        roundLimitMs: 0,
        roundOver: false,
        solved: false,
        perfect: false,
        level: ctx.def.difficulty.start,
        breakdown: {},
      };
    },

    generateRound(s, { rng, params, level, now }) {
      const v = vOf(s.variation);
      const size = Math.max(4, Math.min(10, params.size + (v.sizeDelta ?? 0)));
      const pairCount = Math.max(3, Math.min(12, Math.round(size * params.pairDensity)));
      const board = generateBoard(rng, size, pairCount);
      const dots = new Array<number>(size * size).fill(-1);
      board.pairs.forEach(([a, b], k) => {
        dots[a] = k;
        dots[b] = k;
      });
      const limit = Math.round(size * size * params.timePerCellMs * (v.timeScale ?? 1));
      return {
        ...s,
        round: s.round + 1,
        size,
        pairs: board.pairs,
        dots,
        paths: board.pairs.map(() => []),
        solution: board.solution,
        moves: 0,
        roundHints: 0,
        roundStart: now,
        roundEnd: now + limit,
        roundLimitMs: limit,
        roundOver: false,
        solved: false,
        perfect: false,
        level,
      };
    },

    validate(s, a) {
      if (s.roundOver) return invalid("round over");
      if (!a || (a.type !== "draw" && a.type !== "clear")) return invalid("bad action");
      if (!Number.isInteger(a.color) || a.color < 0 || a.color >= s.pairs.length) return invalid("unknown colour");
      if (a.type === "clear") return valid;
      const cells = a.cells;
      if (!Array.isArray(cells) || !cells.length || cells.length > s.size * s.size) return invalid("bad path");
      const [p, q] = s.pairs[a.color];
      if (cells[0] !== p && cells[0] !== q) return invalid("path must start at a dot");
      const other = cells[0] === p ? q : p;
      const seen = new Set<number>();
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (!Number.isInteger(c) || c < 0 || c >= s.size * s.size) return invalid("off board");
        if (seen.has(c)) return invalid("path crosses itself");
        seen.add(c);
        if (i > 0 && !adjacent(cells[i - 1], c, s.size)) return invalid("cells not adjacent");
        if (s.dots[c] >= 0 && s.dots[c] !== a.color) return invalid("another colour's dot");
        if (c === other && i !== cells.length - 1) return invalid("path continues past its dot");
      }
      return valid;
    },

    reduce(s, a, { now }) {
      if (a.type === "clear") return afterChange(s, { ...s, paths: s.paths.map((p, k) => (k === a.color ? [] : p)) }, now);
      const next: ConnectState = { ...s, paths: withPath(s, a.color, a.cells), moves: s.moves + (a.stroke ? 1 : 0) };
      return afterChange(s, next, now);
    },

    tick(s, { now }) {
      if (s.roundOver || now < s.roundEnd) return { state: s };
      return close(s, now, false);
    },

    hints(s) {
      if (s.roundOver || s.pairs.every((_, k) => isConnected(s, k))) return [];
      return [{ id: "reveal", label: "Solve one pair", cost: HINT_PENALTY }];
    },

    applyHint(s, hintId, { now }) {
      if (hintId !== "reveal" || s.roundOver) return { state: s };
      const k = s.pairs.findIndex((_, i) => !isConnected(s, i));
      if (k < 0) return { state: s };
      const next: ConnectState = { ...s, paths: withPath(s, k, s.solution[k]), roundHints: s.roundHints + 1, hintsUsed: s.hintsUsed + 1 };
      return afterChange(s, next, now);
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

    result: (s) => ({ score: s.score, correct: s.correct, attempts: s.attempts, breakdown: s.breakdown }),

    serialize: (s) => s as unknown as Json,

    restore(json): Result<ConnectState> {
      return isConnectState(json) ? ok(json) : err("connect_dots: invalid saved state");
    },
  };
}
