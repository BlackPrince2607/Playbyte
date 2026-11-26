import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OnlineMatch } from "../api";
import {
  effectiveMatchStatus,
  matchCanShowResult,
  matchHistorySubtitle,
  matchIsFinished,
} from "./battleHistory";

function match(partial: Partial<OnlineMatch>): OnlineMatch {
  return {
    id: "m1",
    status: "playing",
    gameKey: "quiz",
    gameTitle: "Quiz",
    seed: "s",
    foundAt: null,
    readyAt: null,
    playDeadlineAt: null,
    completedAt: null,
    countdownSeconds: 0,
    playerA: { userId: "a", displayName: "You", avatarKey: null },
    playerB: { userId: "b", displayName: "Khan", avatarKey: null },
    scoreA: null,
    scoreB: null,
    rematchOfId: null,
    opponent: { userId: "b", displayName: "Khan", avatarKey: null },
    myScore: 12,
    theirScore: null,
    iHavePlayed: true,
    theyHavePlayed: false,
    ...partial,
  };
}

describe("battleHistory", () => {
  it("treats forfeited matches as finished with scores, not waiting", () => {
    const m = match({ status: "forfeit", myScore: 12, theirScore: null });
    assert.equal(effectiveMatchStatus(m), "forfeit");
    assert.equal(matchIsFinished(m), true);
    assert.equal(matchCanShowResult(m), true);
    const subtitle = matchHistorySubtitle(m, {
      opponent: "Opponent",
      waiting: (name) => `Waiting for ${name}…`,
      matched: (name) => `Matched vs ${name}`,
      scored: (my, their, name) => `You ${my} · ${name} ${their}`,
      cancelled: "Cancelled",
    });
    assert.equal(subtitle, "You 12 · Khan —");
    assert.ok(!subtitle.includes("Waiting"));
  });

  it("heals past-deadline open matches on the client", () => {
    const m = match({
      status: "playing",
      playDeadlineAt: new Date(Date.now() - 60_000).toISOString(),
      iHavePlayed: true,
      myScore: 9,
    });
    assert.equal(effectiveMatchStatus(m), "forfeit");
    assert.equal(matchIsFinished(m), true);
  });

  it("keeps active waits when the deadline is still ahead", () => {
    const m = match({
      status: "playing",
      playDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
      iHavePlayed: true,
    });
    assert.equal(effectiveMatchStatus(m), "playing");
    assert.equal(matchIsFinished(m), false);
    const subtitle = matchHistorySubtitle(m, {
      opponent: "Opponent",
      waiting: (name) => `Waiting for ${name}…`,
      matched: (name) => `Matched vs ${name}`,
      scored: (my, their, name) => `You ${my} · ${name} ${their}`,
      cancelled: "Cancelled",
    });
    assert.equal(subtitle, "Waiting for Khan…");
  });
});
