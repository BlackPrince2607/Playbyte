import type { Challenge, MatchStatus, OnlineMatch } from "../api";

const TERMINAL: ReadonlySet<string> = new Set(["completed", "forfeit", "expired", "cancelled"]);

export function isTerminalMatchStatus(status: string): boolean {
  return TERMINAL.has(status);
}

/** Client-side heal when the API still reports an open match past its deadline. */
export function effectiveMatchStatus(m: OnlineMatch): MatchStatus {
  if (isTerminalMatchStatus(m.status)) return m.status;
  if (m.iHavePlayed && m.theyHavePlayed) return "completed";
  if (m.playDeadlineAt) {
    const deadline = Date.parse(m.playDeadlineAt);
    if (Number.isFinite(deadline) && deadline <= Date.now()) {
      return m.iHavePlayed || m.theyHavePlayed ? "forfeit" : "expired";
    }
  }
  return m.status;
}

export function matchIsFinished(m: OnlineMatch): boolean {
  return isTerminalMatchStatus(effectiveMatchStatus(m));
}

export function matchCanShowResult(m: OnlineMatch): boolean {
  if (!matchIsFinished(m)) return false;
  return m.myScore != null || m.theirScore != null || m.iHavePlayed === true;
}

export function matchHistorySubtitle(
  m: OnlineMatch,
  labels: {
    opponent: string;
    waiting: (name: string) => string;
    matched: (name: string) => string;
    scored: (my: string | number, their: string | number, name: string) => string;
    cancelled: string;
  },
): string {
  const status = effectiveMatchStatus(m);
  const name = m.opponent?.displayName ?? labels.opponent;
  if (status === "cancelled") return labels.cancelled;
  if (status === "completed" || status === "forfeit" || status === "expired") {
    return labels.scored(m.myScore ?? "—", m.theirScore ?? "—", name);
  }
  if (m.iHavePlayed) return labels.waiting(name);
  return labels.matched(name);
}

export function challengeCanShowResult(c: Challenge): boolean {
  return c.status === "completed" && (c.myScore != null || c.theirScore != null);
}
