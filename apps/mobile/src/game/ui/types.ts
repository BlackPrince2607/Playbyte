import type { ComponentType } from "react";
import type { ContentBundle } from "../content/types";
import type { GameDefinition } from "../core/definition";
import type { AnyEngine } from "../core/engine";
import type { DispatchResult, SessionSnapshot } from "../session/runner";

/** Props every engine UI receives. Views render state and dispatch actions; they hold no rules. */
export type EngineViewProps<S, A> = {
  snapshot: SessionSnapshot<S>;
  state: S;
  dispatch: (action: A) => DispatchResult;
  requestHint: (hintId: string) => void;
  /** Session clock (active ms) — use for countdown rendering, never Date.now(). */
  now: () => number;
  definition: GameDefinition;
  content: ContentBundle;
  /** Resolves a content media URL to a cached local URI when available. */
  resolveAsset: (url: string) => string;
};

export type EngineModule = {
  engine: AnyEngine;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  View: ComponentType<EngineViewProps<any, any>>;
  /** Comfortable response time for speed-aware difficulty (ms). */
  targetResponseMs?: number;
  /** Rapid-fire engines skip the host's per-outcome flash and haptic and give their own lighter feedback. */
  quietOutcomes?: boolean;
};

export type { CompletedPlay } from "../session/types";
