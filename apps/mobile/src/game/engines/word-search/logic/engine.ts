import { selectItems } from "../../../content/query";
import type { ContentItem } from "../../../content/types";
import type { GameDefinition } from "../../../core/definition";
import type { EngineMeta, GameEngine } from "../../../core/engine";
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
import { pickItem } from "../../quiz/logic/distractors";
import { endOf, generateGrid, lineCells, normWord } from "./grid";
import type { ThemeEntry, WordSearchAction, WordSearchParams, WordSearchState } from "./types";

export const WS_DIMENSIONS: (DimensionSpec & { key: keyof WordSearchParams })[] = [
  { key: "size", label: "Grid size", easy: 6, hard: 10 },
  { key: "wordCount", label: "Words to find", easy: 4, hard: 8 },
  { key: "dirCount", label: "Directions", easy: 2, hard: 8 },
  { key: "timeLimitMs", label: "Time per grid (ms)", easy: 150_000, hard: 80_000 },
  { key: "targetDifficulty", label: "Theme difficulty", easy: 0.1, hard: 0.6 },
];

export const WS_SCORING: AnswerScoring = { ...DEFAULT_ANSWER_SCORING, speedMax: 5, hintPenalty: 4 };
/** Points per letter beyond four. */
export const LENGTH_BONUS = 2;
/** Clearing a grid early: up to this many points for time left. */
export const CLEAR_BONUS = 50;

export type WordSearchVariation = { rounds: number; timeScale: number; sizeDelta: number; wordDelta: number; hidden: boolean };

export const WS_VARIATIONS: Record<string, WordSearchVariation> = {
  classic: { rounds: 3, timeScale: 1, sizeDelta: 0, wordDelta: 0, hidden: false },
  blitz: { rounds: 5, timeScale: 0.4, sizeDelta: -1, wordDelta: -1, hidden: false },
  mystery: { rounds: 3, timeScale: 1.2, sizeDelta: 0, wordDelta: 0, hidden: true },
};

export function themeFromItem(item: ContentItem): ThemeEntry | null {
  const members = item.attributes.members;
  if (!item.answer || !Array.isArray(members)) return null;
  const words = [...new Set(members.filter((m): m is string => typeof m === "string").map(normWord))].filter((w) => w.length >= 3 && w.length <= 10);
  return words.length >= 4 ? { id: item.id, theme: item.answer, words, difficulty: item.difficulty } : null;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const sameCell = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1];

function isWsState(x: unknown): x is WordSearchState {
  if (!isObj(x) || x.v !== 1) return false;
  const nums = ["total", "round", "score", "streak", "correct", "attempts", "roundStart", "roundEnd", "roundLimitMs", "lastFindAt", "level"];
  if (!nums.every((k) => typeof x[k] === "number" && Number.isFinite(x[k] as number))) return false;
  return Array.isArray(x.grid) && Array.isArray(x.words) && Array.isArray(x.found) && Array.isArray(x.pool) && isObj(x.cfg) && typeof x.roundOver === "boolean";
}

export function createWordSearchEngine(meta: EngineMeta): GameEngine<WordSearchState, WordSearchAction, WordSearchParams> {
  const difficulty: DifficultyModel<WordSearchParams> = {
    dimensions: WS_DIMENSIONS,
    paramsFor: (level) => interpolate(WS_DIMENSIONS, level, ["size", "wordCount", "dirCount", "timeLimitMs"]) as WordSearchParams,
    defaultController: "staircase",
  };
  const vOf = (variation: string) => WS_VARIATIONS[variation];
  const rounds = (def: GameDefinition) => Math.max(1, Math.min(10, def.roundCount ?? vOf(def.variation).rounds));
  const cfgOf = (def: GameDefinition) => answerScoring(def, WS_SCORING);
  const categoriesOf = (def: GameDefinition) => def.content?.categories ?? (def.category ? [def.category] : undefined);
  const maxWords = WS_DIMENSIONS.find((d) => d.key === "wordCount")!.hard + 1;
  const maxLen = 10;

  const finished = (s: WordSearchState) => s.roundOver && s.round >= s.total;

  function closeRound(s: WordSearchState, now: number): WordSearchState {
    const cleared = s.found.length >= s.words.length;
    const bonus = cleared ? timeRemainingBonus(s.roundEnd - now, s.roundLimitMs, CLEAR_BONUS) : 0;
    return { ...s, roundOver: true, score: s.score + bonus, breakdown: bonus ? addBreakdown(s.breakdown, { clear: bonus }) : s.breakdown };
  }

  return {
    meta,
    difficulty,

    checkDefinition(def) {
      if (!vOf(def.variation) || !meta.variations.some((v) => v.id === def.variation)) return err(`word_search: unknown variation "${def.variation}"`);
      return ok(def);
    },

    contentNeeds: (def) => [{ types: ["word_group"], categories: categoriesOf(def), min: 3 }],

    maxScore(def) {
      const cfg = cfgOf(def);
      return rounds(def) * (maxWords * (maxAnswerPoints(cfg) + LENGTH_BONUS * (maxLen - 4)) + CLEAR_BONUS);
    },

    init(ctx, rng) {
      const items = selectItems(ctx.content, { types: ["word_group"], categories: categoriesOf(ctx.def) });
      const pool = rng.sample(items.map(themeFromItem).filter((t): t is ThemeEntry => t !== null), 60);
      const v = vOf(ctx.def.variation);
      return {
        v: 1,
        variation: ctx.def.variation,
        total: Math.min(rounds(ctx.def), Math.max(1, pool.length)),
        round: 0,
        score: 0,
        streak: 0,
        correct: 0,
        attempts: 0,
        pool,
        used: [],
        theme: "",
        grid: [],
        words: [],
        found: [],
        hinted: [],
        hidden: v.hidden,
        roundStart: ctx.now,
        roundEnd: ctx.now,
        roundLimitMs: 0,
        lastFindAt: ctx.now,
        roundOver: false,
        roundHints: 0,
        hintsUsed: 0,
        lastSelection: null,
        level: ctx.def.difficulty.start,
        breakdown: {},
        cfg: cfgOf(ctx.def),
      };
    },

    generateRound(s, { rng, params, level, now }) {
      const v = vOf(s.variation);
      const size = Math.max(5, params.size + v.sizeDelta);
      const count = Math.max(3, params.wordCount + v.wordDelta);
      const asPool = s.pool.map((t) => ({ id: t.id, answer: t.theme, difficulty: t.difficulty, clues: [] }));
      const pick = pickItem(asPool, new Set(s.used), params.targetDifficulty, rng);
      const theme = s.pool.find((t) => t.id === pick?.id) ?? s.pool[0];
      if (!theme) throw new Error("word_search: no themes");
      const words = rng.sample(theme.words.filter((w) => w.length <= size), count + 2);
      const { grid, placed } = generateGrid(rng, words, size, params.dirCount, count);
      const limit = Math.round(params.timeLimitMs * v.timeScale);
      return {
        ...s,
        round: s.round + 1,
        theme: theme.theme,
        used: [...s.used, theme.id].slice(-Math.max(1, s.pool.length - 1)),
        grid,
        words: placed,
        found: [],
        hinted: [],
        roundStart: now,
        roundEnd: now + limit,
        roundLimitMs: limit,
        lastFindAt: now,
        roundOver: false,
        roundHints: 0,
        lastSelection: null,
        level,
      };
    },

    validate(s, a) {
      if (s.roundOver) return invalid("round over");
      if (!a || a.type !== "select" || !Array.isArray(a.from) || !Array.isArray(a.to)) return invalid("bad action");
      const n = s.grid.length;
      for (const [r, c] of [a.from, a.to]) {
        if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= n || c >= n) return invalid("off grid");
      }
      if (sameCell(a.from, a.to)) return invalid("single cell");
      if (!lineCells(a.from, a.to)) return invalid("not a straight line");
      return valid;
    },

    reduce(s, a, { now }) {
      const cells = lineCells(a.from, a.to)!;
      const letters = cells.map(([r, c]) => s.grid[r][c]).join("");
      const reversed = [...letters].reverse().join("");
      const foundWords = new Set(s.found.map((f) => f.word));
      const match = s.words.find((p) => !foundWords.has(p.word) && (p.word === letters || p.word === reversed));
      if (!match) {
        return {
          state: { ...s, streak: 0, attempts: s.attempts + 1, lastSelection: { from: a.from, to: a.to, ok: false } },
          outcome: { correct: false, responseMs: now - s.lastFindAt, mistakes: 1 },
          events: [{ name: "ws_miss", props: { length: letters.length } }],
        };
      }
      const streak = s.streak + 1;
      const hinted = s.hinted.includes(match.word) ? 1 : 0;
      const b = scoreAnswer(s.cfg, {
        correct: true,
        responseMs: now - s.lastFindAt,
        limitMs: Math.round(s.roundLimitMs / Math.max(1, s.words.length)),
        streak,
        level: s.level,
        hintsUsed: hinted,
      });
      const lengthBonus = LENGTH_BONUS * Math.max(0, match.word.length - 4);
      const points = b.total + lengthBonus;
      let next: WordSearchState = {
        ...s,
        score: s.score + points,
        streak,
        correct: s.correct + 1,
        attempts: s.attempts + 1,
        found: [...s.found, { word: match.word, from: match.start, to: endOf(match) }],
        lastFindAt: now,
        lastSelection: { from: a.from, to: a.to, ok: true },
        breakdown: addBreakdown(addBreakdown(s.breakdown, b), { length: lengthBonus }),
      };
      if (next.found.length >= next.words.length) next = closeRound(next, now);
      return {
        state: next,
        outcome: { correct: true, responseMs: now - s.lastFindAt, points, hintUsed: hinted > 0 },
        events: [{ name: "ws_found", props: { word: match.word } }],
      };
    },

    tick(s, { now }) {
      if (s.roundOver || now < s.roundEnd) return { state: s };
      return { state: closeRound(s, now), events: [{ name: "ws_timeout", props: { found: s.found.length, of: s.words.length } }] };
    },

    hints(s) {
      if (s.roundOver) return [];
      const found = new Set(s.found.map((f) => f.word));
      const left = s.words.filter((w) => !found.has(w.word) && !s.hinted.includes(w.word));
      return left.length ? [{ id: "reveal", label: "Show a start", cost: s.cfg.hintPenalty }] : [];
    },

    applyHint(s, hintId, { rng }) {
      if (hintId !== "reveal" || s.roundOver) return { state: s };
      const found = new Set(s.found.map((f) => f.word));
      const left = s.words.filter((w) => !found.has(w.word) && !s.hinted.includes(w.word));
      if (!left.length) return { state: s };
      const w = rng.pick(left);
      return { state: { ...s, hinted: [...s.hinted, w.word], roundHints: s.roundHints + 1, hintsUsed: s.hintsUsed + 1 } };
    },

    status: (s) => (!s.roundOver ? "playing" : finished(s) ? "gameOver" : "roundOver"),

    progress: (s) => ({
      round: s.round,
      totalRounds: s.total,
      score: s.score,
      streak: s.streak,
      deadline: s.roundOver ? undefined : s.roundEnd,
    }),

    result: (s) => ({ score: s.score, correct: s.correct, attempts: s.attempts, breakdown: s.breakdown }),

    serialize: (s) => s as unknown as Json,

    restore(json): Result<WordSearchState> {
      return isWsState(json) ? ok(json) : err("word_search: invalid saved state");
    },
  };
}
