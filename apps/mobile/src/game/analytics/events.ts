import { Json } from "../core/types";

export type StandardEventType =
  | "GAME_STARTED"
  | "GAME_RESTORED"
  | "ROUND_STARTED"
  | "ACTION_PERFORMED"
  | "ANSWER_SUBMITTED"
  | "ANSWER_CORRECT"
  | "ANSWER_WRONG"
  | "HINT_USED"
  | "ROUND_COMPLETED"
  | "DIFFICULTY_CHANGED"
  | "STREAK_STARTED"
  | "STREAK_BROKEN"
  | "GAME_PAUSED"
  | "GAME_RESUMED"
  | "GAME_COMPLETED"
  | "GAME_ABANDONED"
  | "CONTENT_FALLBACK"
  | "GAME_ERROR";

/** Standard envelope for every game analytics event, standard or engine-specific ("ENGINE"). */
export type GameEvent = {
  type: StandardEventType | "ENGINE";
  /** Engine-specific event name when type === "ENGINE". */
  name?: string;
  sessionId: string;
  gameKey: string;
  engineId: string;
  engineVersion: number;
  variation: string;
  category?: string;
  round: number;
  seed: string;
  /** Session clock (active ms). */
  clockMs: number;
  /** Wall-clock epoch ms. */
  ts: number;
  props?: Record<string, Json>;
  /** Assigned when queued for upload and kept across retries, so the server can drop replays. */
  eventId?: string;
};

/** The streak length at which a run counts as a streak (STREAK_STARTED / STREAK_BROKEN). */
export const STREAK_THRESHOLD = 3;
