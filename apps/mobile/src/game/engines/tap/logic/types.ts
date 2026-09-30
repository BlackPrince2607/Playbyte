import type { AnswerScoring } from "../../../scoring";

export type TargetKind = "target" | "bonus" | "decoy";

/** A scheduled target. Positions are normalised 0..1; `r` is a fraction of the field's short side. */
export type TapTarget = {
  id: number;
  kind: TargetKind;
  x: number;
  y: number;
  /** End position (targets drift from x,y to x2,y2 over their lifetime). */
  x2: number;
  y2: number;
  r: number;
  /** Session-clock time the target appears. */
  at: number;
  ttl: number;
  emoji?: string;
};

export type TapParams = {
  targetSize: number;
  spawnMs: number;
  ttlMs: number;
  maxAlive: number;
  drift: number;
  decoyRatio: number;
  bonusRatio: number;
  reactionWindowMs: number;
  falseCueChance: number;
};

export type TapMode = "rush" | "grid" | "reaction";

export type TapRule = { tap: string[]; avoid: string[]; bonus?: string[]; tapLabel: string; avoidLabel: string };

export type TapAction = { type: "tap"; id: number | null };

export type TapState = {
  v: 1;
  variation: string;
  mode: TapMode;
  total: number;
  round: number;
  score: number;
  streak: number;
  bestStreak: number;
  hits: number;
  misses: number;
  escaped: number;
  avoided: number;
  attempts: number;
  lives: number | null;
  roundMs: number;
  roundStart: number;
  roundEnd: number;
  roundOver: boolean;
  roundHits: number;
  roundMisses: number;
  roundEscaped: number;
  targets: TapTarget[];
  /** Ids already hit or expired. */
  done: number[];
  nextId: number;
  grid: number;
  /** Reaction mode. */
  goAt: number | null;
  cueAt: number | null;
  reactionMs: number | null;
  falseStart: boolean;
  bestReactionMs: number | null;
  lastHit: { id: number; points: number; x: number; y: number } | null;
  /** Tap/Don't Tap: what to tap and what to avoid this round (shown to the player). */
  rule?: TapRule | null;
  /** True when this round's rule differs from the previous round's. */
  ruleFlipped?: boolean;
  level: number;
  breakdown: Record<string, number>;
  cfg: AnswerScoring;
};
