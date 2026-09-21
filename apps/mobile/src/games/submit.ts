import { api } from "../api";

export async function submitPlay(
  gameKey: string,
  score: number,
  durationMs: number,
  idempotencyKey: string,
) {
  return api<{ score: number; percentile: number; playsToday: number; promptAccountCreation: boolean }>(
    `/v1/games/${gameKey}/plays`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ score, durationMs }),
    },
  );
}
