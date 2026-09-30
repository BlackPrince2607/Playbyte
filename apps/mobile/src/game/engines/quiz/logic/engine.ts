/**
 * Shared multiple-choice engine family. Guess, Emoji Guess, Odd One Out and Fact/Fake are
 * configurations of this core: each supplies metadata and variation strategies; rules, timing,
 * hints, scoring and persistence live here once.
 */
import { selectItems } from "../../../content/query";
import type { ContentItem } from "../../../content/types";
import type { GameDefinition } from "../../../core/definition";
import type { EngineMeta, GameEngine, ReduceResult } from "../../../core/engine";
import { Json, Result, err, invalid, ok, valid } from "../../../core/types";
import { interpolate } from "../../../difficulty/controllers";
import type { DifficultyModel, DimensionSpec } from "../../../difficulty/types";
import { AnswerScoring, DEFAULT_ANSWER_SCORING, addBreakdown, answerScoring, maxAnswerPoints, scoreAnswer } from "../../../scoring";
import { pickDistractors, pickItem } from "./distractors";
import type {
  BuildContext,
  Clue,
  PoolItem,
  QuizAction,
  QuizParams,
  QuizQuestion,
  QuizState,
  QuizStrategies,
  QuizStrategy,
} from "./types";

export const QUIZ_DIMENSIONS: (DimensionSpec & { key: keyof QuizParams })[] = [
  { key: "optionCount", label: "Answer options", easy: 3, hard: 5 },
  { key: "similarity", label: "Distractor similarity", easy: 0.15, hard: 0.85 },
  { key: "targetDifficulty", label: "Item difficulty", easy: 0.15, hard: 0.85 },
  { key: "timeLimitMs", label: "Time per question (ms)", easy: 15_000, hard: 7_000 },
  { key: "startClues", label: "Clues shown up front", easy: 3, hard: 1 },
];

export function quizDifficulty(dims = QUIZ_DIMENSIONS): DifficultyModel<QuizParams> {
  return {
    dimensions: dims,
    paramsFor: (level) => interpolate(dims, level, ["optionCount", "timeLimitMs", "startClues"]) as QuizParams,
    defaultController: "staircase",
  };
}

/** ContentItem -> PoolItem: media first (emoji/image), then editorial hints as progressive text clues. */
export function defaultToPool(item: ContentItem): PoolItem | null {
  if (!item.answer) return null;
  const clues: Clue[] = [];
  for (const m of item.media ?? []) {
    if (m.kind === "emoji") clues.push({ kind: "emoji", value: m.value });
    else if (m.kind === "image") clues.push({ kind: "image", value: m.url, alt: m.alt });
  }
  for (const h of item.hints ?? []) clues.push({ kind: "text", value: h });
  if (!clues.length) return null;
  const distractors = item.attributes.distractors;
  return {
    id: item.id,
    answer: item.answer,
    aliases: item.aliases,
    group: item.distractorGroup,
    difficulty: item.difficulty,
    clues,
    attrs: Array.isArray(distractors) ? { distractors } : undefined,
  };
}

/** Standard question: the item's clues, its answer plus generated distractors, shuffled. */
export function defaultBuild(prompt: string) {
  return ({ item, pool, params, rng }: BuildContext): QuizQuestion | null => {
    const wrong = pickDistractors(item, pool, Math.max(1, params.optionCount - 1), params.similarity, rng);
    if (!wrong.length) return null;
    return {
      id: item.id,
      prompt,
      clues: item.clues,
      options: rng.shuffle([{ id: item.id, label: item.answer }, ...wrong]),
      answerId: item.id,
    };
  };
}

export type QuizEngineSpec = {
  meta: EngineMeta;
  strategies: QuizStrategies;
  defaultRounds?: number;
  scoringDefaults?: AnswerScoring;
  difficulty?: DifficultyModel<QuizParams>;
  /** Max pool entries kept in state (memory / persistence bound). */
  poolCap?: number;
  hints?: boolean;
};

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

function isQuizState(x: unknown): x is QuizState {
  if (!isObj(x) || x.v !== 1) return false;
  const nums = ["total", "round", "score", "streak", "correct", "attempts", "revealed", "roundHints", "hintsUsed", "roundStart", "timeLimitMs", "level"];
  if (!nums.every((k) => typeof x[k] === "number" && Number.isFinite(x[k] as number))) return false;
  if (typeof x.variation !== "string" || !Array.isArray(x.pool) || !Array.isArray(x.used) || !Array.isArray(x.eliminated)) return false;
  if (x.q !== null && !(isObj(x.q) && Array.isArray(x.q.options) && typeof x.q.answerId === "string" && Array.isArray(x.q.clues))) return false;
  if (x.answer !== null && !isObj(x.answer)) return false;
  if (x.fixedLimitMs !== null && typeof x.fixedLimitMs !== "number") return false;
  if (x.lives !== null && typeof x.lives !== "number") return false;
  return isObj(x.cfg) && isObj(x.breakdown);
}

export function createQuizEngine(spec: QuizEngineSpec): GameEngine<QuizState, QuizAction, QuizParams> {
  const difficulty = spec.difficulty ?? quizDifficulty();
  const defaultRounds = spec.defaultRounds ?? 10;
  const poolCap = spec.poolCap ?? 150;
  const hintsOn = spec.hints ?? true;
  const strategyOf = (variation: string): QuizStrategy | undefined => spec.strategies[variation];
  const rounds = (def: GameDefinition) => Math.max(1, Math.min(50, def.roundCount ?? defaultRounds));
  const cfgOf = (def: GameDefinition) => answerScoring(def, spec.scoringDefaults ?? DEFAULT_ANSWER_SCORING);
  const categoriesFor = (def: GameDefinition, s: QuizStrategy) =>
    def.content?.categories ?? (def.category ? [def.category] : s.categories);

  const finished = (s: QuizState) => s.answer !== null && (s.round >= s.total || s.lives === 0);

  function answer(s: QuizState, optionId: string | null, now: number): ReduceResult<QuizState> {
    const q = s.q!;
    const correct = optionId === q.answerId;
    const responseMs = Math.max(0, now - s.roundStart);
    const streak = correct ? s.streak + 1 : 0;
    const b = scoreAnswer(s.cfg, { correct, responseMs, limitMs: s.timeLimitMs, streak, level: s.level, hintsUsed: s.roundHints });
    const state: QuizState = {
      ...s,
      answer: { optionId, correct, responseMs },
      score: s.score + b.total,
      streak,
      correct: s.correct + (correct ? 1 : 0),
      attempts: s.attempts + 1,
      lives: s.lives === null || correct ? s.lives : Math.max(0, s.lives - 1),
      deadline: null,
      breakdown: addBreakdown(s.breakdown, b),
    };
    return {
      state,
      outcome: { correct, responseMs, points: b.total, hintUsed: s.roundHints > 0 },
      events: [{ name: optionId === null ? "quiz_timeout" : "quiz_answer", props: { item: q.id, correct, hints: s.roundHints } }],
    };
  }

  return {
    meta: spec.meta,
    difficulty,

    checkDefinition(def) {
      const s = strategyOf(def.variation);
      const v = spec.meta.variations.find((x) => x.id === def.variation);
      if (!s || !v) return err(`${spec.meta.id}: unknown variation "${def.variation}"`);
      if (v.available === false) return err(`${spec.meta.id}: variation "${def.variation}" is not available`);
      return ok(def);
    },

    contentNeeds(def) {
      const s = strategyOf(def.variation);
      if (!s || s.procedural) return [];
      return [{ types: s.types, categories: categoriesFor(def, s), min: s.minItems ?? 6 }];
    },

    maxScore: (def) => rounds(def) * maxAnswerPoints(cfgOf(def)),

    init(ctx, rng) {
      const s = strategyOf(ctx.def.variation)!;
      let pool: PoolItem[] = [];
      if (!s.procedural) {
        const items = selectItems(ctx.content, { types: s.types, categories: categoriesFor(ctx.def, s) });
        const toPool = s.toPool ?? defaultToPool;
        pool = rng.sample(items.map(toPool).filter((p): p is PoolItem => p !== null), poolCap);
      }
      const total = s.procedural ? rounds(ctx.def) : Math.min(rounds(ctx.def), Math.max(1, pool.length));
      return {
        v: 1,
        variation: ctx.def.variation,
        total,
        round: 0,
        score: 0,
        streak: 0,
        correct: 0,
        attempts: 0,
        lives: ctx.def.lives ?? null,
        pool,
        used: [],
        q: null,
        revealed: 0,
        eliminated: [],
        roundHints: 0,
        hintsUsed: 0,
        answer: null,
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
      const strategy = strategyOf(s.variation)!;
      const round = s.round + 1;
      let q: QuizQuestion | null = null;
      let used = s.used;
      if (strategy.procedural) {
        q = strategy.procedural(rng, params, round);
      } else {
        const build = strategy.build ?? defaultBuild(strategy.prompt);
        const tried = new Set(used);
        for (let attempt = 0; attempt < 12 && !q; attempt++) {
          const item = pickItem(s.pool, tried, params.targetDifficulty, rng);
          if (!item) break;
          tried.add(item.id);
          q = build({ item, pool: s.pool, params, rng, round });
          if (q) used = [...used.filter((id) => id !== item.id), item.id].slice(-Math.max(1, s.pool.length - 1));
        }
      }
      if (!q) throw new Error(`${spec.meta.id}: could not build a question`);
      const timeLimitMs = s.fixedLimitMs ?? params.timeLimitMs;
      return {
        ...s,
        round,
        q,
        used,
        answer: null,
        revealed: Math.max(1, Math.min(q.clues.length, params.startClues)),
        eliminated: [],
        roundHints: 0,
        roundStart: now,
        timeLimitMs,
        deadline: now + timeLimitMs,
        level,
      };
    },

    validate(s, a) {
      if (!s.q || s.answer) return invalid("no open question");
      if (!a || a.type !== "answer" || typeof a.optionId !== "string") return invalid("bad action");
      if (!s.q.options.some((o) => o.id === a.optionId)) return invalid("unknown option");
      if (s.eliminated.includes(a.optionId)) return invalid("option eliminated");
      return valid;
    },

    reduce: (s, a, ctx) => answer(s, a.optionId, ctx.now),

    tick(s, ctx) {
      if (!s.q || s.answer || s.deadline === null || ctx.now < s.deadline) return { state: s };
      return answer(s, null, ctx.now);
    },

    hints(s) {
      if (!hintsOn || !s.q || s.answer) return [];
      const out = [];
      if (s.revealed < s.q.clues.length) out.push({ id: "clue", label: "Next clue", cost: s.cfg.hintPenalty });
      if (s.q.options.length > 2 && s.eliminated.length === 0) out.push({ id: "fifty", label: "50/50", cost: s.cfg.hintPenalty });
      return out;
    },

    applyHint(s, hintId, ctx) {
      if (!s.q || s.answer) return { state: s };
      if (hintId === "clue" && s.revealed < s.q.clues.length) {
        return { state: { ...s, revealed: s.revealed + 1, roundHints: s.roundHints + 1, hintsUsed: s.hintsUsed + 1 } };
      }
      if (hintId === "fifty" && s.eliminated.length === 0) {
        const wrong = s.q.options.filter((o) => o.id !== s.q!.answerId);
        const remove = ctx.rng.sample(wrong, Math.floor(s.q.options.length / 2)).map((o) => o.id);
        return { state: { ...s, eliminated: remove, roundHints: s.roundHints + 1, hintsUsed: s.hintsUsed + 1 } };
      }
      return { state: s };
    },

    status: (s) => (s.answer === null ? "playing" : finished(s) ? "gameOver" : "roundOver"),

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

    restore(json): Result<QuizState> {
      return isQuizState(json) ? ok(json) : err(`${spec.meta.id}: invalid saved state`);
    },
  };
}
