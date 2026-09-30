import type { ContentItem } from "../../../content/types";
import type { GameDefinition } from "../../../core/definition";
import type { Rng } from "../../../core/rng";
import type { Json } from "../../../core/types";
import type { AnswerScoring } from "../../../scoring";

/** One piece of the prompt: a big emoji, an image, or a text clue revealed progressively. */
export type Clue = { kind: "emoji" | "text" | "image"; value: string; alt?: string };

/** `alt` is the accessible name when the visible option is emoji-only. */
export type QuizOption = { id: string; label: string; emoji?: string; alt?: string };

export type QuizQuestion = {
  id: string;
  prompt: string;
  clues: Clue[];
  options: QuizOption[];
  answerId: string;
  /** Shown after answering (fact explanations, trivia). */
  explanation?: string;
};

/** Compact, serializable projection of a ContentItem kept in engine state. */
export type PoolItem = {
  id: string;
  answer: string;
  aliases?: string[];
  group?: string;
  difficulty: number;
  clues: Clue[];
  attrs?: Record<string, Json>;
};

export type QuizParams = {
  optionCount: number;
  /** 0..1: how often distractors come from the answer's own group (harder). */
  similarity: number;
  /** 0..1: preferred item difficulty. */
  targetDifficulty: number;
  timeLimitMs: number;
  /** Clues visible before any hint. */
  startClues: number;
};

export type BuildContext = { item: PoolItem; pool: PoolItem[]; params: QuizParams; rng: Rng; round: number };

/**
 * A variation of a quiz engine: which content it reads, how an item becomes a pool entry, and how
 * a pool entry becomes a question. Strategies are data + small pure functions (no switches).
 */
export type QuizStrategy = {
  types: string[];
  prompt: string;
  /** Default content categories (overridden by definition.category / content.categories). */
  categories?: string[];
  toPool?: (item: ContentItem) => PoolItem | null;
  build?: (ctx: BuildContext) => QuizQuestion | null;
  /** Procedural strategies need no content and generate each question from the rng. */
  procedural?: (rng: Rng, params: QuizParams, round: number) => QuizQuestion;
  /** Minimum pool size to start (content strategies). */
  minItems?: number;
};

export type QuizStrategies = Record<string, QuizStrategy>;

export type QuizAnswer = { optionId: string | null; correct: boolean; responseMs: number };

export type QuizState = {
  v: 1;
  variation: string;
  total: number;
  round: number;
  score: number;
  streak: number;
  correct: number;
  attempts: number;
  lives: number | null;
  pool: PoolItem[];
  used: string[];
  q: QuizQuestion | null;
  revealed: number;
  eliminated: string[];
  roundHints: number;
  hintsUsed: number;
  answer: QuizAnswer | null;
  roundStart: number;
  deadline: number | null;
  timeLimitMs: number;
  /** Definition-level per-question limit; overrides the difficulty-driven one. */
  fixedLimitMs: number | null;
  level: number;
  breakdown: Record<string, number>;
  cfg: AnswerScoring;
};

export type QuizAction = { type: "answer"; optionId: string };

export type DefinitionCheck = (def: GameDefinition) => string | null;
