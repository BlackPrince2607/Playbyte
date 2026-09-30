import type { AnswerScoring } from "../../../scoring";
import type { Cell, Placement } from "./grid";

export type WordSearchParams = {
  size: number;
  wordCount: number;
  dirCount: number;
  timeLimitMs: number;
  targetDifficulty: number;
};

export type ThemeEntry = { id: string; theme: string; words: string[]; difficulty: number };

export type WordSearchAction = { type: "select"; from: Cell; to: Cell };

export type FoundWord = { word: string; from: Cell; to: Cell };

export type WordSearchState = {
  v: 1;
  variation: string;
  total: number;
  round: number;
  score: number;
  streak: number;
  correct: number;
  attempts: number;
  pool: ThemeEntry[];
  used: string[];
  theme: string;
  grid: string[];
  words: Placement[];
  found: FoundWord[];
  /** Words whose first letter was revealed by a hint. */
  hinted: string[];
  hidden: boolean;
  roundStart: number;
  roundEnd: number;
  roundLimitMs: number;
  lastFindAt: number;
  roundOver: boolean;
  roundHints: number;
  hintsUsed: number;
  lastSelection: { from: Cell; to: Cell; ok: boolean } | null;
  level: number;
  breakdown: Record<string, number>;
  cfg: AnswerScoring;
};
