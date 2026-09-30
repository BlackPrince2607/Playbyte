import { GameDefinition } from "../core/definition";
import { EngineResult, Json } from "../core/types";
import { PlayerPerformance } from "../difficulty/types";

export type SessionStatus = "ready" | "playing" | "paused" | "roundOver" | "completed" | "abandoned";

export type ActionLogEntry = { t: number; a: Json };

/** Serializable snapshot of a play session; enough to resume it after the app is killed. */
export type GameSession = {
  schemaVersion: 1;
  sessionId: string;
  gameKey: string;
  engineId: string;
  engineVersion: number;
  variation: string;
  category?: string;
  seed: string;
  definition: GameDefinition;
  status: SessionStatus;
  round: number;
  totalRounds: number | null;
  score: number;
  streak: number;
  lives?: number;
  deadline?: number;
  activeElapsedMs: number;
  difficulty: { level: number; history: { round: number; level: number }[] };
  performance: PlayerPerformance;
  /** Capped action log; with the seed it allows replay-based verification. */
  actions: ActionLogEntry[];
  actionCount: number;
  engineState: Json;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  result?: EngineResult;
  contentSource: string;
  /** Card title, kept so a recovered session can be shown before the catalog loads. */
  title?: string;
  /** Per-round results for the post-game breakdown (first MAX_ROUND_RECORDS rounds). */
  rounds?: RoundRecord[];
};

export type RoundRecord = { round: number; points: number; correct: number; attempts: number };

export const MAX_ACTION_LOG = 400;
export const MAX_ROUND_RECORDS = 30;

/** A finished play, handed to the app for score submission. */
export type CompletedPlay = {
  gameKey: string;
  score: number;
  durationMs: number;
  sessionId: string;
  engine?: string;
  variation?: string;
  engineVersion?: number;
  seed?: string;
  level?: number;
  correct?: number;
  attempts?: number;
  breakdown?: Record<string, number>;
  rounds?: RoundRecord[];
};

/** Minimal async key-value interface (AsyncStorage-compatible) so persistence stays testable. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  };
}
