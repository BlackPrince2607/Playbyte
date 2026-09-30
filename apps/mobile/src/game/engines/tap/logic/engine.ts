/**
 * Real-time tap engine family. Tap (rush, grid, reaction) and Tap/Don't Tap are configurations of
 * this core. Each round's targets are pre-scheduled from the seeded rng, so replays do not depend
 * on how often the host ticks.
 */
import type { GameDefinition } from "../../../core/definition";
import type { EngineMeta, GameEngine, ReduceResult } from "../../../core/engine";
import { Json, Result, err, invalid, ok, valid } from "../../../core/types";
import { interpolate } from "../../../difficulty/controllers";
import type { DifficultyModel, DimensionSpec } from "../../../difficulty/types";
import {
  AnswerScoring,
  addBreakdown,
  answerScoring,
  applyPct,
  difficultyMultiplier,
  maxAnswerPoints,
  scoreAnswer,
} from "../../../scoring";
import { positionAt, spawnTargets } from "./spawn";
import type { TapAction, TapMode, TapParams, TapRule, TapState, TapTarget } from "./types";

export const TAP_DIMENSIONS: (DimensionSpec & { key: keyof TapParams })[] = [
  { key: "targetSize", label: "Target size", easy: 0.12, hard: 0.065 },
  { key: "spawnMs", label: "Spawn interval (ms)", easy: 850, hard: 380 },
  { key: "ttlMs", label: "Target lifetime (ms)", easy: 1900, hard: 850 },
  { key: "maxAlive", label: "Targets on screen", easy: 2, hard: 5 },
  { key: "drift", label: "Target movement", easy: 0, hard: 0.22 },
  { key: "decoyRatio", label: "Decoys", easy: 0, hard: 0 },
  { key: "bonusRatio", label: "Bonus targets", easy: 0.05, hard: 0.12 },
  { key: "reactionWindowMs", label: "Reaction window (ms)", easy: 1000, hard: 550 },
  { key: "falseCueChance", label: "False cues", easy: 0, hard: 0.5 },
];

export function tapDifficulty(dims = TAP_DIMENSIONS): DifficultyModel<TapParams> {
  return {
    dimensions: dims,
    paramsFor: (level) => interpolate(dims, level, ["spawnMs", "ttlMs", "maxAlive", "reactionWindowMs"]) as TapParams,
    defaultController: "staircase",
  };
}

export const TAP_SCORING: AnswerScoring = {
  base: 5,
  speedMax: 3,
  speedCurve: "linear",
  streakStep: 1,
  streakCap: 4,
  hintPenalty: 0,
  mistakePenalty: 2,
  difficultyBonusPct: 50,
};

/** Per-round accuracy bonus: up to this many points at 100% accuracy. */
export const ACCURACY_BONUS = 50;
/** Late taps within this window after a target vanishes still count (render latency). */
export const HIT_GRACE_MS = 150;
/** Reaction mode: points for an instant response, scaled down to 0 at the window's end. */
export const REACTION_POINTS = 100;
const REACTION_FLOOR_MS = 120;

export type TapVariationSpec = {
  mode: TapMode;
  rounds: number;
  roundMs?: number;
  emoji?: { target: string[]; bonus: string[]; decoy: string[] };
  /** Tap/Don't Tap: the round's rule; decoys are drawn from `avoid`. Takes precedence over `emoji`. */
  rule?: (round: number) => TapRule;
  /** Overrides applied on top of the difficulty-driven params. */
  params?: (p: TapParams) => TapParams;
};

export type TapEngineSpec = {
  meta: EngineMeta;
  variations: Record<string, TapVariationSpec>;
  difficulty?: DifficultyModel<TapParams>;
  scoringDefaults?: AnswerScoring;
};

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

function isTapState(x: unknown): x is TapState {
  if (!isObj(x) || x.v !== 1) return false;
  const nums = ["total", "round", "score", "streak", "hits", "misses", "escaped", "attempts", "roundStart", "roundEnd", "roundMs", "nextId", "level"];
  if (!nums.every((k) => typeof x[k] === "number" && Number.isFinite(x[k] as number))) return false;
  if (x.mode !== "rush" && x.mode !== "grid" && x.mode !== "reaction") return false;
  return Array.isArray(x.targets) && Array.isArray(x.done) && isObj(x.cfg) && isObj(x.breakdown) && typeof x.roundOver === "boolean";
}

export function reactionPoints(ms: number, windowMs: number): number {
  const k = (windowMs - ms) / Math.max(1, windowMs - REACTION_FLOOR_MS);
  return Math.round(REACTION_POINTS * Math.max(0, Math.min(1, k)));
}

export function createTapEngine(spec: TapEngineSpec): GameEngine<TapState, TapAction, TapParams> {
  const difficulty = spec.difficulty ?? tapDifficulty();
  const vspec = (variation: string) => spec.variations[variation];
  const cfgOf = (def: GameDefinition) => answerScoring(def, spec.scoringDefaults ?? TAP_SCORING);
  const roundsOf = (def: GameDefinition) => Math.max(1, Math.min(20, def.roundCount ?? vspec(def.variation).rounds));
  const roundMsOf = (def: GameDefinition) =>
    def.timeLimitSec ? Math.round(Math.min(120, Math.max(5, def.timeLimitSec)) * 1000) : (vspec(def.variation).roundMs ?? 12_000);
  const paramsFor = (variation: string, p: TapParams) => vspec(variation).params?.(p) ?? p;

  const finished = (s: TapState) => s.roundOver && (s.round >= s.total || s.lives === 0);

  /** Misses count as slow responses for the speed-aware difficulty controller. */
  const slowMs = (s: TapState) => s.targets[0]?.ttl ?? 1000;

  function loseLife(s: TapState): number | null {
    return s.lives === null ? null : Math.max(0, s.lives - 1);
  }

  /** Closes a rush/grid round: accuracy bonus for the round. */
  function closeRound(s: TapState): TapState {
    const tries = s.roundHits + s.roundMisses + s.roundEscaped;
    const acc = tries ? s.roundHits / tries : 0;
    const bonus = Math.round(ACCURACY_BONUS * acc * acc);
    return { ...s, roundOver: true, score: s.score + bonus, breakdown: addBreakdown(s.breakdown, { accuracy: bonus }) };
  }

  function hit(s: TapState, t: TapTarget, now: number): ReduceResult<TapState> {
    const streak = s.streak + 1;
    const responseMs = Math.max(0, now - t.at);
    const b = scoreAnswer(s.cfg, { correct: true, responseMs, limitMs: t.ttl, streak, level: s.level });
    const points = t.kind === "bonus" ? b.total * 2 : b.total;
    const pos = positionAt(t, now);
    return {
      state: {
        ...s,
        score: s.score + points,
        streak,
        bestStreak: Math.max(s.bestStreak, streak),
        hits: s.hits + 1,
        roundHits: s.roundHits + 1,
        attempts: s.attempts + 1,
        done: [...s.done, t.id],
        lastHit: { id: t.id, points, x: pos.x, y: pos.y },
        breakdown: addBreakdown(s.breakdown, t.kind === "bonus" ? { ...b, bonus: b.total } : b),
      },
      outcome: { correct: true, responseMs, points },
      events: t.kind === "bonus" ? [{ name: "tap_bonus", props: { points } }] : undefined,
    };
  }

  function miss(s: TapState, targetId?: number): ReduceResult<TapState> {
    const penalty = Math.min(s.score, s.cfg.mistakePenalty);
    const next: TapState = {
      ...s,
      score: s.score - penalty,
      streak: 0,
      misses: s.misses + 1,
      roundMisses: s.roundMisses + 1,
      attempts: s.attempts + 1,
      lives: loseLife(s),
      done: targetId !== undefined ? [...s.done, targetId] : s.done,
      breakdown: addBreakdown(s.breakdown, { mistakes: -penalty }),
    };
    return {
      state: next.lives === 0 ? closeRound(next) : next,
      outcome: { correct: false, responseMs: slowMs(s), mistakes: 1 },
    };
  }

  function reactionTap(s: TapState, now: number): ReduceResult<TapState> {
    if (s.goAt === null || now < s.goAt) {
      return {
        state: { ...s, falseStart: true, roundOver: true, streak: 0, misses: s.misses + 1, attempts: s.attempts + 1, lives: loseLife(s) },
        outcome: { correct: false, responseMs: 0, mistakes: 1 },
        events: [{ name: "tap_false_start" }],
      };
    }
    const ms = now - s.goAt;
    const window = s.roundEnd - s.goAt;
    const raw = reactionPoints(ms, window);
    const points = applyPct(raw, difficultyMultiplier(s.level, s.cfg.difficultyBonusPct));
    return {
      state: {
        ...s,
        roundOver: true,
        reactionMs: ms,
        bestReactionMs: s.bestReactionMs === null ? ms : Math.min(s.bestReactionMs, ms),
        score: s.score + points,
        streak: s.streak + 1,
        bestStreak: Math.max(s.bestStreak, s.streak + 1),
        hits: s.hits + 1,
        attempts: s.attempts + 1,
        breakdown: addBreakdown(s.breakdown, { base: raw, difficulty: points - raw }),
      },
      outcome: { correct: true, responseMs: ms, points },
      events: [{ name: "tap_reaction", props: { ms } }],
    };
  }

  return {
    meta: spec.meta,
    difficulty,

    checkDefinition(def) {
      const v = spec.meta.variations.find((x) => x.id === def.variation);
      if (!vspec(def.variation) || !v) return err(`${spec.meta.id}: unknown variation "${def.variation}"`);
      if (v.available === false) return err(`${spec.meta.id}: variation "${def.variation}" is not available`);
      return ok(def);
    },

    contentNeeds: () => [],

    maxScore(def) {
      const v = vspec(def.variation);
      const cfg = cfgOf(def);
      const rounds = roundsOf(def);
      if (v.mode === "reaction") return rounds * applyPct(REACTION_POINTS, difficultyMultiplier(1, cfg.difficultyBonusPct));
      const minSpawn = Math.min(...difficulty.dimensions.filter((d) => d.key === "spawnMs").map((d) => Math.min(d.easy, d.hard)));
      const maxTargets = Math.ceil(roundMsOf(def) / (minSpawn * 0.7)) + 1;
      return rounds * (maxTargets * maxAnswerPoints(cfg) * 2 + ACCURACY_BONUS);
    },

    init(ctx) {
      const v = vspec(ctx.def.variation);
      return {
        v: 1,
        variation: ctx.def.variation,
        mode: v.mode,
        total: roundsOf(ctx.def),
        round: 0,
        score: 0,
        streak: 0,
        bestStreak: 0,
        hits: 0,
        misses: 0,
        escaped: 0,
        avoided: 0,
        attempts: 0,
        lives: ctx.def.lives ?? null,
        roundMs: roundMsOf(ctx.def),
        roundStart: ctx.now,
        roundEnd: ctx.now,
        roundOver: false,
        roundHits: 0,
        roundMisses: 0,
        roundEscaped: 0,
        targets: [],
        done: [],
        nextId: 1,
        grid: 0,
        goAt: null,
        cueAt: null,
        reactionMs: null,
        falseStart: false,
        bestReactionMs: null,
        lastHit: null,
        level: ctx.def.difficulty.start,
        breakdown: {},
        cfg: cfgOf(ctx.def),
      };
    },

    generateRound(s, { rng, params, level, now }) {
      const p = paramsFor(s.variation, params);
      const base: TapState = {
        ...s,
        round: s.round + 1,
        roundOver: false,
        roundHits: 0,
        roundMisses: 0,
        roundEscaped: 0,
        roundStart: now,
        targets: [],
        done: [],
        lastHit: null,
        goAt: null,
        cueAt: null,
        reactionMs: null,
        falseStart: false,
        level,
      };
      if (s.mode === "reaction") {
        const delay = rng.int(1200, 3500);
        const goAt = now + delay;
        const cueAt = delay > 1400 && rng.chance(p.falseCueChance) ? now + rng.int(500, delay - 700) : null;
        return { ...base, goAt, cueAt, roundEnd: goAt + p.reactionWindowMs };
      }
      const grid = s.mode === "grid" ? (p.targetSize > 0.09 ? 3 : 4) : 0;
      const v = vspec(s.variation);
      const rule: TapRule | null = v.rule ? v.rule(base.round) : null;
      const emoji = rule ? { target: rule.tap, decoy: rule.avoid, bonus: rule.bonus ?? rule.tap } : v.emoji;
      const ruleFlipped = !!rule && !!s.rule && (rule.tap[0] !== s.rule.tap[0] || rule.avoid[0] !== s.rule.avoid[0]);
      const targets = spawnTargets(rng, p, { start: now, roundMs: s.roundMs, firstId: s.nextId, grid, emoji });
      return { ...base, grid, targets, rule, ruleFlipped, roundEnd: now + s.roundMs, nextId: s.nextId + targets.length };
    },

    validate(s, a) {
      if (s.roundOver) return invalid("round over");
      if (!a || a.type !== "tap" || (a.id !== null && typeof a.id !== "number")) return invalid("bad action");
      if (a.id !== null) {
        if (!s.targets.some((t) => t.id === a.id)) return invalid("unknown target");
        if (s.done.includes(a.id)) return invalid("already resolved");
      }
      return valid;
    },

    reduce(s, a, { now }) {
      if (s.mode === "reaction") return reactionTap(s, now);
      if (a.id === null) return miss(s);
      const t = s.targets.find((x) => x.id === a.id)!;
      if (now < t.at || now > t.at + t.ttl + HIT_GRACE_MS) return miss(s, t.id);
      if (t.kind === "decoy") return { ...miss(s, t.id), events: [{ name: "tap_decoy" }] };
      return hit(s, t, now);
    },

    tick(s, { now }) {
      if (s.roundOver) return { state: s };
      if (s.mode === "reaction") {
        if (now < s.roundEnd) return { state: s };
        return {
          state: { ...s, roundOver: true, reactionMs: null, streak: 0, misses: s.misses + 1, attempts: s.attempts + 1, lives: loseLife(s) },
          outcome: { correct: false, responseMs: s.roundEnd - (s.goAt ?? s.roundEnd), mistakes: 1 },
          events: [{ name: "tap_too_slow" }],
        };
      }
      const expired = s.targets.filter((t) => !s.done.includes(t.id) && now > t.at + t.ttl + HIT_GRACE_MS);
      let next = s;
      let outcome: ReduceResult<TapState>["outcome"];
      if (expired.length) {
        const escaped = expired.filter((t) => t.kind !== "decoy").length;
        const avoided = expired.length - escaped;
        let lives = s.lives;
        for (let i = 0; i < escaped && lives !== null; i++) lives = Math.max(0, lives - 1);
        next = {
          ...s,
          done: [...s.done, ...expired.map((t) => t.id)],
          escaped: s.escaped + escaped,
          roundEscaped: s.roundEscaped + escaped,
          avoided: s.avoided + avoided,
          attempts: s.attempts + escaped,
          streak: escaped ? 0 : s.streak,
          lives,
        };
        if (escaped) outcome = { correct: false, responseMs: slowMs(s), mistakes: escaped };
      }
      if (now >= s.roundEnd || next.lives === 0) next = closeRound(next);
      return { state: next, outcome };
    },

    hints: () => [],

    status: (s) => (!s.roundOver ? "playing" : finished(s) ? "gameOver" : "roundOver"),

    progress: (s) => ({
      round: s.round,
      totalRounds: s.total,
      score: s.score,
      streak: s.streak,
      lives: s.lives ?? undefined,
      deadline: s.mode === "reaction" || s.roundOver ? undefined : s.roundEnd,
    }),

    result: (s) => ({
      score: s.score,
      correct: s.hits,
      attempts: s.attempts,
      breakdown: { ...s.breakdown, hits: s.hits, misses: s.misses, escaped: s.escaped, bestStreak: s.bestStreak, ...(s.bestReactionMs !== null ? { bestReactionMs: s.bestReactionMs } : {}) },
    }),

    serialize: (s) => s as unknown as Json,

    restore(json): Result<TapState> {
      return isTapState(json) ? ok(json) : err(`${spec.meta.id}: invalid saved state`);
    },
  };
}
