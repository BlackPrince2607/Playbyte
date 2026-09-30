export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <T = never>(error: string): Result<T> => ({ ok: false, error });

export type EngineId =
  | "guess"
  | "emoji_guess"
  | "spot_difference"
  | "odd_one_out"
  | "word_search"
  | "tap"
  | "tap_dont_tap"
  | "connect_dots"
  | "maze"
  | "fact_fake"
  | "choice"
  | "color_sort"
  | "memory"
  | "sequence"
  | (string & {});

export type ValidationResult = { valid: true } | { valid: false; reason: string };
export const valid: ValidationResult = { valid: true };
export const invalid = (reason: string): ValidationResult => ({ valid: false, reason });

export type Hint = { id: string; label: string; cost: number };

/** Round-level outcome an engine reports so the runner can track performance and emit events. */
export type ActionOutcome = {
  correct: boolean;
  responseMs: number;
  mistakes?: number;
  hintUsed?: boolean;
  /** Engine-specific points gained by this action (already included in engine score). */
  points?: number;
};

export type EngineStatus = "playing" | "roundOver" | "gameOver";

/** Common HUD-facing progress every engine exposes. */
export type EngineProgress = {
  round: number;
  totalRounds: number | null;
  score: number;
  streak: number;
  lives?: number;
  /** Absolute clock time (session clock ms) when the current round/game times out. */
  deadline?: number;
};

export type EngineResult = {
  score: number;
  correct: number;
  attempts: number;
  breakdown?: Record<string, number>;
};

export type ScoreDirection = "higher_is_better" | "lower_is_better";
