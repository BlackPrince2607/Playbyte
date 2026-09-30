import type { GameDefinition } from "../../../core/definition";
import type { EngineMeta, GameEngine, ReduceResult } from "../../../core/engine";
import { Json, Result, err, invalid, ok, valid } from "../../../core/types";
import { interpolate } from "../../../difficulty/controllers";
import type { DifficultyModel, DimensionSpec } from "../../../difficulty/types";
import { addBreakdown, applyPct, difficultyMultiplier, timeRemainingBonus } from "../../../scoring";
import { DIR_BIT, Dir, distances, generateMaze, neighbour, open, runFrom, shortestPath, tourLength, xy } from "./maze";

export type MazeParams = { size: number; braid: number; timePerCellMs: number; gems: number };
export type MazeAction = { type: "move"; dir: Dir; run?: boolean };

export type MazeState = {
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
  walls: number[];
  start: number;
  exit: number;
  pos: number;
  gems: number[];
  got: number[];
  /** Cells walked this round, in order (for the trail; capped). */
  trail: number[];
  steps: number;
  par: number;
  /** Fog radius in cells (0 = no fog) and cells the player has seen. */
  fog: number;
  seen: number[];
  hintPath: number[];
  roundHints: number;
  hintsUsed: number;
  roundStart: number;
  roundEnd: number;
  roundLimitMs: number;
  roundOver: boolean;
  escaped: boolean;
  level: number;
  breakdown: Record<string, number>;
};

export const MAZE_DIMENSIONS: (DimensionSpec & { key: keyof MazeParams })[] = [
  { key: "size", label: "Maze size", easy: 6, hard: 13 },
  { key: "braid", label: "Dead ends removed", easy: 0.6, hard: 0.05 },
  { key: "timePerCellMs", label: "Time per cell (ms)", easy: 1100, hard: 520 },
  { key: "gems", label: "Gems (gem mazes)", easy: 3, hard: 5 },
];

export const ESCAPE_POINTS = 50;
export const TIME_BONUS = 40;
export const EFFICIENCY_BONUS = 30;
export const GEM_POINTS = 10;
export const HINT_PENALTY = 10;
const HINT_CELLS = 6;
const TRAIL_CAP = 400;

export type MazeVariation = { rounds: number; sizeDelta?: number; timeScale?: number; gems?: boolean; fog?: number };

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

function isMazeState(x: unknown): x is MazeState {
  if (!isObj(x) || x.v !== 1) return false;
  const nums = ["total", "round", "score", "size", "start", "exit", "pos", "steps", "par", "fog", "roundStart", "roundEnd", "roundLimitMs", "level"];
  if (!nums.every((k) => typeof x[k] === "number" && Number.isFinite(x[k] as number))) return false;
  return Array.isArray(x.walls) && Array.isArray(x.gems) && Array.isArray(x.got) && Array.isArray(x.trail) && Array.isArray(x.seen) && typeof x.roundOver === "boolean";
}

/** Cells within `r` (Chebyshev) of `c`. */
function around(c: number, r: number, size: number): number[] {
  const [cx, cy] = xy(c, size);
  const out: number[] = [];
  for (let y = Math.max(0, cy - r); y <= Math.min(size - 1, cy + r); y++)
    for (let x = Math.max(0, cx - r); x <= Math.min(size - 1, cx + r); x++) out.push(y * size + x);
  return out;
}

const addSeen = (seen: number[], cells: number[]) => {
  const set = new Set(seen);
  for (const c of cells) set.add(c);
  return [...set];
};

export function createMazeEngine(meta: EngineMeta, variations: Record<string, MazeVariation>): GameEngine<MazeState, MazeAction, MazeParams> {
  const difficulty: DifficultyModel<MazeParams> = {
    dimensions: MAZE_DIMENSIONS,
    paramsFor: (level) => interpolate(MAZE_DIMENSIONS, level, ["size", "gems", "timePerCellMs"]) as MazeParams,
    defaultController: "staircase",
  };
  const vOf = (id: string) => variations[id];
  const rounds = (def: GameDefinition) => Math.max(1, Math.min(10, def.roundCount ?? vOf(def.variation).rounds));
  const maxGems = MAZE_DIMENSIONS.find((d) => d.key === "gems")!.hard;
  const finished = (s: MazeState) => s.roundOver && (s.round >= s.total || s.lives === 0);
  const exitOpen = (s: MazeState) => s.got.length >= s.gems.length;

  function closeRound(s: MazeState, now: number, escaped: boolean): ReduceResult<MazeState> {
    let points = 0;
    const b: Record<string, number> = {};
    if (escaped) {
      const base = applyPct(ESCAPE_POINTS, difficultyMultiplier(s.level));
      const time = timeRemainingBonus(s.roundEnd - now, s.roundLimitMs, TIME_BONUS);
      const eff = Math.floor((EFFICIENCY_BONUS * Math.min(s.par, s.steps)) / Math.max(1, s.steps));
      const hints = Math.min(base + time + eff, s.roundHints * HINT_PENALTY);
      points = base + time + eff - hints;
      Object.assign(b, { base, time, efficiency: eff, hints: -hints });
    }
    const streak = escaped ? s.streak + 1 : 0;
    return {
      state: {
        ...s,
        roundOver: true,
        escaped,
        score: s.score + points,
        streak,
        correct: s.correct + (escaped ? 1 : 0),
        attempts: s.attempts + 1,
        lives: escaped || s.lives === null ? s.lives : Math.max(0, s.lives - 1),
        hintPath: [],
        breakdown: addBreakdown(s.breakdown, b),
      },
      outcome: { correct: escaped, responseMs: Math.max(0, now - s.roundStart), points, hintUsed: s.roundHints > 0 },
      events: [{ name: escaped ? "maze_escaped" : "maze_timeout", props: { steps: s.steps, par: s.par, size: s.size } }],
    };
  }

  return {
    meta,
    difficulty,

    checkDefinition(def) {
      const v = meta.variations.find((x) => x.id === def.variation);
      if (!vOf(def.variation) || !v) return err(`maze: unknown variation "${def.variation}"`);
      if (v.available === false) return err(`maze: variation "${def.variation}" is not available`);
      return ok(def);
    },

    contentNeeds: () => [],

    maxScore(def) {
      const perRound = applyPct(ESCAPE_POINTS, difficultyMultiplier(1)) + TIME_BONUS + EFFICIENCY_BONUS + (vOf(def.variation).gems ? maxGems * GEM_POINTS : 0);
      return rounds(def) * perRound;
    },

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
        walls: [],
        start: 0,
        exit: 0,
        pos: 0,
        gems: [],
        got: [],
        trail: [],
        steps: 0,
        par: 0,
        fog: vOf(ctx.def.variation).fog ?? 0,
        seen: [],
        hintPath: [],
        roundHints: 0,
        hintsUsed: 0,
        roundStart: ctx.now,
        roundEnd: ctx.now,
        roundLimitMs: 0,
        roundOver: false,
        escaped: false,
        level: ctx.def.difficulty.start,
        breakdown: {},
      };
    },

    generateRound(s, { rng, params, level, now }) {
      const v = vOf(s.variation);
      const size = Math.max(5, Math.min(15, params.size + (v.sizeDelta ?? 0)));
      const walls = generateMaze(rng, size, params.braid);
      const corners = [0, size - 1, size * (size - 1), size * size - 1];
      const start = rng.pick(corners);
      const dist = distances(walls, size, start);
      const exit = dist.indexOf(Math.max(...dist));
      let gems: number[] = [];
      if (v.gems) {
        // Spread gems: prefer cells far from start, exit and each other.
        const pool = rng.shuffle(Array.from({ length: size * size }, (_, i) => i).filter((i) => i !== start && i !== exit));
        for (const c of pool) {
          if (gems.length >= params.gems) break;
          const [x, y] = xy(c, size);
          const far = [start, exit, ...gems].every((o) => {
            const [ox, oy] = xy(o, size);
            return Math.abs(ox - x) + Math.abs(oy - y) >= Math.max(2, Math.floor(size / 3));
          });
          if (far) gems.push(c);
        }
        gems = gems.sort((a, b) => a - b);
      }
      const par = v.gems ? tourLength(walls, size, start, gems, exit) : dist[exit];
      const limit = Math.round(size * size * params.timePerCellMs * (v.timeScale ?? 1));
      return {
        ...s,
        round: s.round + 1,
        size,
        walls,
        start,
        exit,
        pos: start,
        gems,
        got: [],
        trail: [start],
        steps: 0,
        par,
        seen: s.fog ? around(start, s.fog, size) : [],
        hintPath: [],
        roundHints: 0,
        roundStart: now,
        roundEnd: now + limit,
        roundLimitMs: limit,
        roundOver: false,
        escaped: false,
        level,
      };
    },

    validate(s, a) {
      if (s.roundOver) return invalid("round over");
      if (!a || a.type !== "move" || !(a.dir in DIR_BIT)) return invalid("bad action");
      if (!open(s.walls, s.pos, DIR_BIT[a.dir])) return invalid("wall");
      return valid;
    },

    reduce(s, a, { now }) {
      const bit = DIR_BIT[a.dir];
      const stops = new Set([s.exit, ...s.gems.filter((g) => !s.got.includes(g))]);
      const cells = a.run ? runFrom(s.walls, s.size, s.pos, bit, (c) => stops.has(c)) : [neighbour(s.pos, bit, s.size)];
      const got = [...s.got];
      const events: { name: string; props?: Record<string, Json> }[] = [];
      let gemPoints = 0;
      for (const c of cells) {
        if (s.gems.includes(c) && !got.includes(c)) {
          got.push(c);
          gemPoints += GEM_POINTS;
          events.push({ name: "maze_gem", props: { left: s.gems.length - got.length } });
        }
      }
      const pos = cells[cells.length - 1];
      const trail = [...s.trail, ...cells].slice(-TRAIL_CAP);
      const onRoute = s.hintPath.indexOf(pos);
      const next: MazeState = {
        ...s,
        pos,
        got,
        trail,
        steps: s.steps + cells.length,
        score: s.score + gemPoints,
        breakdown: gemPoints ? addBreakdown(s.breakdown, { gems: gemPoints }) : s.breakdown,
        seen: s.fog ? addSeen(s.seen, cells.flatMap((c) => around(c, s.fog, s.size))) : s.seen,
        hintPath: onRoute >= 0 ? s.hintPath.slice(onRoute + 1) : [],
      };
      if (pos === s.exit && exitOpen(next)) {
        const r = closeRound(next, now, true);
        return { ...r, events: [...events, ...(r.events ?? [])] };
      }
      return { state: next, events };
    },

    tick(s, { now }) {
      if (s.roundOver || now < s.roundEnd) return { state: s };
      return closeRound(s, now, false);
    },

    hints(s) {
      if (s.roundOver) return [];
      return [{ id: "path", label: "Show the way", cost: HINT_PENALTY }];
    },

    applyHint(s, hintId) {
      if (hintId !== "path" || s.roundOver) return { state: s };
      const target = s.gems.find((g) => !s.got.includes(g)) ?? s.exit;
      const route = shortestPath(s.walls, s.size, s.pos, target).slice(1, 1 + HINT_CELLS);
      return { state: { ...s, hintPath: route, roundHints: s.roundHints + 1, hintsUsed: s.hintsUsed + 1 } };
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

    restore(json): Result<MazeState> {
      return isMazeState(json) ? ok(json) : err("maze: invalid saved state");
    },
  };
}
