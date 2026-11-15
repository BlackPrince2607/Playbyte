import type { GameEngine, ReduceResult } from "../../../core/engine";
import { err, invalid, ok, valid } from "../../../core/types";
import { interpolate } from "../../../difficulty/controllers";
import type { DifficultyModel, DimensionSpec } from "../../../difficulty/types";
import { addBreakdown, applyPct, difficultyMultiplier } from "../../../scoring";
import { laneDashMeta } from "../meta";
import { activateDue, planSpawns, type Obstacle, type SpawnPlan } from "./spawn";

export type LaneDashParams = { density: number; baseSpeed: number; timeLimitMs: number };
export type LaneDashAction = { type: "lane"; lane: 0 | 1 | 2 };

export type LaneDashState = {
  v: 1;
  variation: string;
  total: number;
  round: number;
  score: number;
  streak: number;
  correct: number;
  attempts: number;
  lives: number;
  playerLane: 0 | 1 | 2;
  distance: number;
  nearMisses: number;
  crashes: number;
  obstacles: Obstacle[];
  plans: SpawnPlan[];
  spawned: number;
  nextId: number;
  /** Last tick time for dt. */
  lastTick: number;
  invulnUntil: number;
  flashUntil: number;
  nearMissFlashUntil: number;
  roundStart: number;
  roundEnd: number;
  roundLimitMs: number;
  roundOver: boolean;
  survived: boolean;
  level: number;
  breakdown: Record<string, number>;
  fixedLimitMs: number | null;
  speedScale: number;
};

export const LANE_DIMENSIONS: (DimensionSpec & { key: keyof LaneDashParams })[] = [
  { key: "density", label: "Obstacle density", easy: 0.25, hard: 0.85 },
  { key: "baseSpeed", label: "Scroll speed", easy: 0.7, hard: 1.25 },
  { key: "timeLimitMs", label: "Run length (ms)", easy: 42_000, hard: 36_000 },
];

export const DEFAULT_LIVES = 3;
export const INVULN_MS = 800;
export const HIT_Y = 0.82;
export const PASS_Y = 0.95;
export const DISTANCE_SCORE_PER = 12;
export const NEAR_MISS_POINTS = 18;
export const SURVIVAL_BONUS = 80;
export const CRASH_PENALTY = 15;

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

function isLaneState(x: unknown): x is LaneDashState {
  if (!isObj(x) || x.v !== 1) return false;
  const nums = ["total", "round", "score", "lives", "distance", "roundStart", "roundEnd", "roundLimitMs", "level"];
  if (!nums.every((k) => typeof x[k] === "number" && Number.isFinite(x[k] as number))) return false;
  return Array.isArray(x.obstacles) && Array.isArray(x.plans) && typeof x.roundOver === "boolean";
}

const difficulty: DifficultyModel<LaneDashParams> = {
  dimensions: LANE_DIMENSIONS,
  paramsFor: (level) => interpolate(LANE_DIMENSIONS, level, ["density", "baseSpeed", "timeLimitMs"]) as LaneDashParams,
  defaultController: "fixed",
};

function close(s: LaneDashState, survived: boolean): ReduceResult<LaneDashState> {
  const survival = survived ? applyPct(SURVIVAL_BONUS, difficultyMultiplier(s.level)) : 0;
  const distPts = Math.floor(s.distance * DISTANCE_SCORE_PER);
  return {
    state: {
      ...s,
      roundOver: true,
      survived,
      score: s.score + survival,
      correct: s.correct + (survived ? 1 : 0),
      attempts: s.attempts + 1,
      breakdown: addBreakdown(s.breakdown, { distance: distPts, survival, nearMiss: s.nearMisses * NEAR_MISS_POINTS }),
    },
    outcome: {
      correct: survived,
      responseMs: Math.max(0, s.lastTick - s.roundStart),
      points: survival,
      mistakes: s.crashes,
    },
    events: [{ name: survived ? "lane_survived" : "lane_crashed_out", props: { distance: s.distance, nearMisses: s.nearMisses, crashes: s.crashes } }],
  };
}

function stepWorld(s: LaneDashState, now: number, params: { density: number; baseSpeed: number }): ReduceResult<LaneDashState> {
  if (s.roundOver) return { state: s };
  if (now >= s.roundEnd) return close(s, s.lives > 0);

  const dt = Math.max(0, Math.min(0.1, (now - s.lastTick) / 1000));
  const elapsed = Math.max(0, now - s.roundStart);
  const ramp = 1 + Math.min(0.7, elapsed / s.roundLimitMs);
  const speedScale = params.baseSpeed * ramp;

  const activated = activateDue(s.plans, s.spawned, now, s.nextId);
  let obstacles = [...s.obstacles, ...activated.obstacles];
  let lives = s.lives;
  let score = s.score;
  let streak = s.streak;
  let crashes = s.crashes;
  let nearMisses = s.nearMisses;
  let invulnUntil = s.invulnUntil;
  let flashUntil = s.flashUntil;
  let nearMissFlashUntil = s.nearMissFlashUntil;
  const events: { name: string; props?: Record<string, number | string | boolean> }[] = [];
  const b: Record<string, number> = {};

  const nextObs: Obstacle[] = [];
  for (const o of obstacles) {
    const y = o.y + o.speed * speedScale * dt;
    let scored = o.scored;
    let nearMissed = o.nearMissed;

    // Collision zone
    if (y >= HIT_Y && y < PASS_Y && o.lane === s.playerLane && now >= invulnUntil) {
      lives = Math.max(0, lives - 1);
      crashes += 1;
      streak = 0;
      score = Math.max(0, score - CRASH_PENALTY);
      invulnUntil = now + INVULN_MS;
      flashUntil = now + 280;
      b.crash = (b.crash ?? 0) - CRASH_PENALTY;
      events.push({ name: "lane_crash", props: { lane: o.lane, lives } });
      // Consume obstacle on crash
      continue;
    }

    // Near-miss: passes player line in adjacent lane
    if (!nearMissed && y >= HIT_Y && Math.abs(o.lane - s.playerLane) === 1) {
      nearMissed = true;
      nearMisses += 1;
      streak += 1;
      const pts = NEAR_MISS_POINTS + Math.min(12, streak * 2);
      score += pts;
      nearMissFlashUntil = now + 320;
      b.nearMiss = (b.nearMiss ?? 0) + pts;
      events.push({ name: "lane_near_miss", props: { lane: o.lane } });
    }

    if (y >= PASS_Y) {
      if (!scored) {
        scored = true;
        // Quiet survival tick — distance covers most of the score
      }
      continue;
    }
    nextObs.push({ ...o, y, scored, nearMissed });
  }

  const distance = s.distance + speedScale * dt * 2.2;
  const distDelta = Math.floor(distance * DISTANCE_SCORE_PER) - Math.floor(s.distance * DISTANCE_SCORE_PER);
  if (distDelta > 0) {
    score += distDelta;
    b.distance = (b.distance ?? 0) + distDelta;
  }

  let next: LaneDashState = {
    ...s,
    obstacles: nextObs,
    spawned: activated.spawned,
    nextId: activated.nextId,
    lastTick: now,
    lives,
    score,
    streak,
    crashes,
    nearMisses,
    invulnUntil,
    flashUntil,
    nearMissFlashUntil,
    distance,
    speedScale,
    breakdown: Object.keys(b).length ? addBreakdown(s.breakdown, b) : s.breakdown,
  };

  if (lives <= 0) {
    const closed = close(next, false);
    return { ...closed, events: [...events, ...(closed.events ?? [])] };
  }
  return { state: next, events: events.length ? events : undefined };
}

export const laneDashEngine: GameEngine<LaneDashState, LaneDashAction, LaneDashParams> = {
  meta: laneDashMeta,
  difficulty,

  checkDefinition(def) {
    const v = laneDashMeta.variations.find((x) => x.id === def.variation);
    if (!v) return err(`lane_dash: unknown variation "${def.variation}"`);
    if (v.available === false) return err(`lane_dash: variation "${def.variation}" is not available`);
    return ok(def);
  },

  contentNeeds: () => [],

  maxScore(def) {
    const limit = def.timeLimitSec ? def.timeLimitSec * 1000 : 42_000;
    const dist = Math.ceil((limit / 1000) * 1.4 * DISTANCE_SCORE_PER);
    const near = 40 * (NEAR_MISS_POINTS + 12);
    return Math.max(def.maxScore ?? 0, dist + near + SURVIVAL_BONUS);
  },

  init(ctx) {
    return {
      v: 1,
      variation: ctx.def.variation,
      total: 1,
      round: 0,
      score: 0,
      streak: 0,
      correct: 0,
      attempts: 0,
      lives: ctx.def.lives ?? DEFAULT_LIVES,
      playerLane: 1,
      distance: 0,
      nearMisses: 0,
      crashes: 0,
      obstacles: [],
      plans: [],
      spawned: 0,
      nextId: 1,
      lastTick: ctx.now,
      invulnUntil: 0,
      flashUntil: 0,
      nearMissFlashUntil: 0,
      roundStart: ctx.now,
      roundEnd: ctx.now,
      roundLimitMs: 0,
      roundOver: false,
      survived: false,
      level: ctx.def.difficulty.start,
      breakdown: {},
      fixedLimitMs: ctx.def.timeLimitSec ? Math.round(ctx.def.timeLimitSec * 1000) : null,
      speedScale: 1,
    };
  },

  generateRound(s, { rng, params, level, now }) {
    const limit = s.fixedLimitMs ?? Math.round(params.timeLimitMs);
    const plans = planSpawns(rng.fork("spawns"), now, limit, params.density);
    return {
      ...s,
      round: s.round + 1,
      playerLane: 1,
      distance: 0,
      nearMisses: 0,
      crashes: 0,
      obstacles: [],
      plans,
      spawned: 0,
      nextId: 1,
      lastTick: now,
      invulnUntil: 0,
      flashUntil: 0,
      nearMissFlashUntil: 0,
      roundStart: now,
      roundEnd: now + limit,
      roundLimitMs: limit,
      roundOver: false,
      survived: false,
      level,
      speedScale: params.baseSpeed,
    };
  },

  validate(s, a) {
    if (s.roundOver) return invalid("round over");
    if (!a || a.type !== "lane") return invalid("bad action");
    if (a.lane !== 0 && a.lane !== 1 && a.lane !== 2) return invalid("bad lane");
    return valid;
  },

  reduce(s, a) {
    if (s.roundOver) return { state: s };
    if (a.lane === s.playerLane) return { state: s };
    return {
      state: { ...s, playerLane: a.lane },
      events: [{ name: "lane_move", props: { lane: a.lane } }],
    };
  },

  tick(s, ctx) {
    const params = difficulty.paramsFor(s.level);
    return stepWorld(s, ctx.now, { density: params.density, baseSpeed: params.baseSpeed });
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
      lives: s.lives,
      deadline: s.roundOver ? undefined : s.roundEnd,
    };
  },

  result(s) {
    return { score: s.score, correct: s.correct, attempts: s.attempts, breakdown: s.breakdown };
  },

  serialize: (s) => s,
  restore: (json) => (isLaneState(json) ? ok(json) : err("lane_dash: invalid saved state")),
};
