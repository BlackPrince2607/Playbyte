import { api, type MatchmakingTicket, type OnlineMatch } from "../api";

function idem(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.slice(0, 128);
}

export async function enqueueMatchmaking(input: {
  /** Theme lobby — server picks a concrete game from the category pool. */
  category?: string;
  /** Legacy / specific-game queue (friends). Ignored when category is set. */
  gameKey?: string;
  preferredOpponentUserId?: string;
  extend?: boolean;
}): Promise<MatchmakingTicket> {
  const lobby = input.category ?? input.gameKey ?? "any";
  return api<MatchmakingTicket>("/v1/matchmaking/tickets", {
    method: "POST",
    headers: { "Idempotency-Key": idem(`mm-${lobby}`) },
    body: JSON.stringify({
      category: input.category,
      gameKey: input.category ? undefined : input.gameKey,
      preferredOpponentUserId: input.preferredOpponentUserId,
      extend: input.extend ?? false,
    }),
  });
}

export async function getMatchmakingTicket(id: string): Promise<MatchmakingTicket> {
  return api<MatchmakingTicket>(`/v1/matchmaking/tickets/${id}`);
}

export async function cancelMatchmakingTicket(id: string): Promise<{ id: string; status: string }> {
  return api(`/v1/matchmaking/tickets/${id}`, { method: "DELETE" });
}

export async function matchmakingHeartbeat(ticketId?: string): Promise<{ ok: boolean }> {
  return api("/v1/matchmaking/heartbeat", {
    method: "POST",
    body: JSON.stringify({ ticketId }),
  });
}

export async function getMatch(id: string): Promise<OnlineMatch> {
  return api<OnlineMatch>(`/v1/matches/${id}`);
}

export async function forfeitMatch(id: string): Promise<OnlineMatch> {
  return api<OnlineMatch>(`/v1/matches/${id}/forfeit`, { method: "POST" });
}

export async function rematch(id: string): Promise<OnlineMatch> {
  return api<OnlineMatch>(`/v1/matches/${id}/rematch`, {
    method: "POST",
    headers: { "Idempotency-Key": idem(`rematch-${id}`) },
  });
}

export async function listMyMatches(): Promise<OnlineMatch[]> {
  const res = await api<{ matches: OnlineMatch[] }>("/v1/me/matches");
  return res.matches;
}
