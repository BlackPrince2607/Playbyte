import { api, isApiError } from "../../api";
import type { PendingPlay } from "../session/submitQueue";

export type SubmitPlayResponse = { score: number; percentile: number; playsToday: number; promptAccountCreation: boolean };

export async function submitPlay(play: PendingPlay) {
  const summary =
    play.correct !== undefined || play.attempts !== undefined || play.breakdown
      ? { correct: play.correct, attempts: play.attempts, breakdown: play.breakdown }
      : undefined;
  try {
    return await api<SubmitPlayResponse>(`/v1/games/${play.gameKey}/plays`, {
      method: "POST",
      headers: { "Idempotency-Key": play.idempotencyKey },
      body: JSON.stringify({
        score: play.score,
        durationMs: play.durationMs,
        engine: play.engine,
        variation: play.variation,
        engineVersion: play.engineVersion,
        seed: play.seed,
        level: play.level,
        summary,
      }),
    });
  } catch (e) {
    // Validation / unknown-game errors will never succeed on retry.
    if (isApiError(e) && (e.status === 400 || e.status === 404 || e.status === 422)) {
      throw Object.assign(e, { permanent: true });
    }
    throw e;
  }
}
