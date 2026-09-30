import { recentAccuracy } from "./performance";
import { ControllerKind, DifficultySettings, DimensionSpec, PlayerPerformance } from "./types";

/** Outcomes of the round that just finished. */
export type RoundSummary = { attempts: number; correct: number; avgResponseMs: number };

export type ControllerInput = {
  level: number;
  perf: PlayerPerformance;
  round: RoundSummary;
  /** Engine's notion of a comfortable response time; enables speed-aware adaptation. */
  targetResponseMs?: number;
};

export type DifficultyController = (input: ControllerInput) => number;

/**
 * Staircase: step up after a strong round (high accuracy, and fast when a target time is known),
 * step down after a weak one. Long streaks accelerate the climb.
 */
export function staircase(step = 0.1): DifficultyController {
  return ({ level, perf, round, targetResponseMs }) => {
    if (round.attempts === 0) return level;
    const acc = round.correct / round.attempts;
    const fast = targetResponseMs === undefined || round.avgResponseMs <= targetResponseMs;
    const slow = targetResponseMs !== undefined && round.avgResponseMs > targetResponseMs * 2;
    if (acc >= 0.8 && fast) return level + step * (perf.streak >= 5 ? 1.5 : 1);
    if (acc < 0.5 || slow) return level - step;
    return level;
  };
}

/** Proportional controller that nudges the level so recent accuracy converges on `target`. */
export function targetAccuracy(target = 0.75, gain = 0.3): DifficultyController {
  return ({ level, perf }) => level + gain * (recentAccuracy(perf) - target);
}

export const fixed: DifficultyController = ({ level }) => level;

export function controllerFor(kind: ControllerKind): DifficultyController {
  switch (kind) {
    case "target_accuracy":
      return targetAccuracy();
    case "fixed":
      return fixed;
    default:
      return staircase();
  }
}

export function nextLevel(settings: DifficultySettings, input: ControllerInput): number {
  const raw = controllerFor(settings.controller)(input);
  return Math.round(Math.min(settings.max, Math.max(settings.min, raw)) * 1000) / 1000;
}

/** Interpolates a dimension for a level; `round` snaps integer dimensions (grid sizes, counts). */
export function dim(spec: DimensionSpec, level: number, round = false): number {
  const t = Math.min(1, Math.max(0, level));
  const value = spec.easy + (spec.hard - spec.easy) * t;
  return round ? Math.round(value) : value;
}

/** Builds params by interpolating every dimension; `integers` lists keys to round. */
export function interpolate<K extends string>(
  dims: (DimensionSpec & { key: K })[],
  level: number,
  integers: readonly K[] = [],
): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const d of dims) out[d.key] = dim(d, level, integers.includes(d.key));
  return out;
}
