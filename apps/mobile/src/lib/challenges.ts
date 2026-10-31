import { api, type Challenge, type ChallengeCreated, type ChallengeStatus } from "../api";

export async function createChallenge(input: {
  opponentUserId: string;
  gameKey: string;
  playId?: string;
  seed?: string;
  momentId?: string;
}): Promise<ChallengeCreated> {
  const idem = `chal-${input.opponentUserId}-${input.gameKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return api<ChallengeCreated>("/v1/challenges", {
    method: "POST",
    headers: { "Idempotency-Key": idem.slice(0, 128) },
    body: JSON.stringify({
      opponentUserId: input.opponentUserId,
      gameKey: input.gameKey,
      playId: input.playId,
      seed: input.seed,
      momentId: input.momentId,
    }),
  });
}

export async function listChallenges(status?: ChallengeStatus): Promise<Challenge[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await api<{ challenges: Challenge[] }>(`/v1/me/challenges${q}`);
  return res.challenges;
}

export async function getChallenge(id: string): Promise<Challenge> {
  return api<Challenge>(`/v1/challenges/${id}`);
}

export async function acceptChallenge(id: string): Promise<{ status: ChallengeStatus; seed: string; gameKey: string }> {
  return api(`/v1/challenges/${id}/accept`, { method: "POST" });
}

export async function declineChallenge(id: string): Promise<{ status: ChallengeStatus }> {
  return api(`/v1/challenges/${id}/decline`, { method: "POST" });
}
