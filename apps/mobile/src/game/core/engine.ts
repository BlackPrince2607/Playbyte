import { ContentBundle, ContentQuery } from "../content/types";
import { DifficultyModel } from "../difficulty/types";
import { GameDefinition } from "./definition";
import { Rng } from "./rng";
import {
  ActionOutcome,
  EngineId,
  EngineProgress,
  EngineResult,
  EngineStatus,
  Hint,
  Json,
  Result,
  ScoreDirection,
  ValidationResult,
} from "./types";

export type VariationDef = {
  id: string;
  title: string;
  description?: string;
  /** False hides the variation from discovery (e.g. pending content or legal review). */
  available?: boolean;
  /** Content categories this variation draws from by default. */
  categories?: string[];
};

export type Interaction = "choice" | "input" | "grid" | "playfield" | "canvas" | "cards";

export type EngineMeta = {
  id: EngineId;
  title: string;
  version: number;
  interaction: Interaction;
  scoreDirection: ScoreDirection;
  variations: VariationDef[];
  /** When set, the host drives engine.tick at this interval while playing. */
  tickMs?: number;
  /** Pause after a round ends so feedback can play before the next round. */
  roundEndDelayMs?: number;
};

/** Engine-specific analytics event; the runner wraps it in the standard envelope. */
export type EngineEvent = { name: string; props?: Record<string, Json> };

export type EngineInitContext = {
  def: GameDefinition;
  seed: string;
  content: ContentBundle;
  /** Session clock time (active ms, excludes backgrounded time). */
  now: number;
};

export type RoundContext<Params> = {
  rng: Rng;
  params: Params;
  level: number;
  now: number;
};

export type ReduceContext = { rng: Rng; now: number };

export type ReduceResult<S> = {
  state: S;
  /** Present when the action resolved something gradable (an answer, a hit, a miss). */
  outcome?: ActionOutcome;
  events?: EngineEvent[];
};

/**
 * The contract every game engine implements. Engines are pure and deterministic: all time and
 * randomness are injected, state is plain data, and no React/React Native code is imported.
 *
 * Lifecycle: init -> generateRound -> (validate + reduce | tick)* -> roundOver -> generateRound ...
 * -> gameOver -> result. The SessionRunner owns that loop, difficulty adaptation, analytics and
 * persistence; the engine owns rules, generation and scoring.
 */
export interface GameEngine<S, A, P = unknown> {
  meta: EngineMeta;
  difficulty: DifficultyModel<P>;
  /** Engine-specific definition checks (known variation, rule ranges). */
  checkDefinition(def: GameDefinition): Result<GameDefinition>;
  contentNeeds(def: GameDefinition): ContentQuery[];
  maxScore(def: GameDefinition): number;
  init(ctx: EngineInitContext, rng: Rng): S;
  generateRound(state: S, ctx: RoundContext<P>): S;
  validate(state: S, action: A): ValidationResult;
  reduce(state: S, action: A, ctx: ReduceContext): ReduceResult<S>;
  /** Time-driven updates (spawns, timeouts). Must be a no-op when nothing is due. */
  tick?(state: S, ctx: ReduceContext): ReduceResult<S>;
  hints(state: S): Hint[];
  applyHint?(state: S, hintId: string, ctx: ReduceContext): ReduceResult<S>;
  status(state: S): EngineStatus;
  progress(state: S): EngineProgress;
  result(state: S): EngineResult;
  serialize(state: S): Json;
  restore(json: Json): Result<S>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyEngine = GameEngine<any, any, any>;
