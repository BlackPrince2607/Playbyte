/** Shared model of how the player is doing; every difficulty controller reads it. */
export type PlayerPerformance = {
  attempts: number;
  correct: number;
  mistakes: number;
  streak: number;
  bestStreak: number;
  /** Exponentially weighted accuracy, 0..1. */
  accuracyEwma: number;
  /** Exponentially weighted response time in ms. */
  responseMsEwma: number;
  /** Most recent outcomes, newest last (bounded). */
  recent: boolean[];
  hintsUsed: number;
  roundsCompleted: number;
};

/** A single tunable axis of an engine's difficulty, documented for tooling and dashboards. */
export type DimensionSpec = {
  key: string;
  label: string;
  /** Value at level 0 and level 1; engines interpolate (and may round) between them. */
  easy: number;
  hard: number;
};

export type ControllerKind = "staircase" | "target_accuracy" | "fixed";

export type DifficultySettings = {
  /** Starting level 0..1. */
  start: number;
  controller: ControllerKind;
  min: number;
  max: number;
};

/** Engine-owned difficulty: dimensions + a mapping from a 0..1 level to concrete generator params. */
export interface DifficultyModel<Params> {
  dimensions: DimensionSpec[];
  paramsFor(level: number): Params;
  /** Controller used when the game definition does not override it. */
  defaultController: ControllerKind;
}
