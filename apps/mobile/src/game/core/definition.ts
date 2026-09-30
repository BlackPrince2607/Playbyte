import { ControllerKind, DifficultySettings } from "../difficulty/types";
import { v } from "./schema";
import { Json, Result, err, ok } from "./types";

/**
 * Configuration-driven description of a playable game, e.g.
 *   { engine: "guess", variation: "movie", category: "bollywood", roundCount: 10 }
 * Arrives from the backend (mini_games.config) and is validated before an engine sees it.
 */
export type GameDefinition = {
  engine: string;
  variation: string;
  category?: string;
  roundCount: number | null;
  /** Per-round (or whole-game, engine-defined) time limit in seconds. */
  timeLimitSec?: number;
  lives?: number;
  difficulty: DifficultySettings;
  maxScore?: number;
  scoring: Record<string, number>;
  rules: Record<string, Json>;
  content?: { packId?: string; categories?: string[] };
};

const controllerV = v.literal<ControllerKind>("staircase", "target_accuracy", "fixed");

const difficultyV = v.object({
  start: v.withDefault(v.number({ min: 0, max: 1 }), 0.3),
  controller: v.optional(controllerV),
  min: v.withDefault(v.number({ min: 0, max: 1 }), 0),
  max: v.withDefault(v.number({ min: 0, max: 1 }), 1),
});

const definitionV = v.object({
  engine: v.string({ min: 1, max: 64 }),
  variation: v.string({ min: 1, max: 64 }),
  category: v.optional(v.string({ min: 1, max: 64 })),
  roundCount: v.optional(v.number({ min: 1, max: 200, int: true })),
  timeLimitSec: v.optional(v.number({ min: 1, max: 3600 })),
  lives: v.optional(v.number({ min: 1, max: 20, int: true })),
  difficulty: v.optional(difficultyV),
  maxScore: v.optional(v.number({ min: 1, max: 1_000_000, int: true })),
  scoring: v.optional(v.record()),
  rules: v.optional(v.record()),
  content: v.optional(
    v.object({
      packId: v.optional(v.string({ min: 1, max: 128 })),
      categories: v.optional(v.array(v.string({ min: 1, max: 64 }), { max: 20 })),
    }),
  ),
});

export function parseDefinition(raw: unknown, defaultController: ControllerKind = "staircase"): Result<GameDefinition> {
  const r = definitionV(raw, "definition");
  if (!r.ok) return r;
  const d = r.value;
  const diff: { start: number; min: number; max: number; controller?: ControllerKind } = d.difficulty ?? {
    start: 0.3,
    min: 0,
    max: 1,
  };
  if (diff.min > diff.max) return err("definition.difficulty: min above max");
  const scoring: Record<string, number> = {};
  for (const [k, val] of Object.entries(d.scoring ?? {})) {
    if (typeof val === "number" && Number.isFinite(val)) scoring[k] = val;
  }
  return ok({
    engine: d.engine,
    variation: d.variation,
    category: d.category,
    roundCount: d.roundCount ?? null,
    timeLimitSec: d.timeLimitSec,
    lives: d.lives,
    difficulty: {
      start: Math.min(diff.max, Math.max(diff.min, diff.start)),
      controller: diff.controller ?? defaultController,
      min: diff.min,
      max: diff.max,
    },
    maxScore: d.maxScore,
    scoring,
    rules: (d.rules ?? {}) as Record<string, Json>,
    content: d.content,
  });
}

export function ruleNumber(def: GameDefinition, key: string, fallback: number): number {
  const x = def.rules[key];
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

export function ruleString(def: GameDefinition, key: string, fallback: string): string {
  const x = def.rules[key];
  return typeof x === "string" && x ? x : fallback;
}

export function scoringNumber(def: GameDefinition, key: string, fallback: number): number {
  const x = def.scoring[key];
  return typeof x === "number" ? x : fallback;
}
