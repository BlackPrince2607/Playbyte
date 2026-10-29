import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { savePlay, type SubmitQueue } from "./submitQueue";
import type { CompletedPlay } from "./types";

const play: CompletedPlay = {
  gameKey: "color_match",
  sessionId: "sess-1",
  engine: "choice",
  variation: "default",
  engineVersion: 1,
  seed: "seed",
  score: 12,
  durationMs: 4000,
  level: 0.2,
};

describe("savePlay coin fields", () => {
  it("keeps coinsEarned and balance from a successful submit", async () => {
    const queue: SubmitQueue<{
      score: number;
      percentile: number;
      coinsEarned?: number;
      balance?: number | null;
    }> = {
      submit: async () => ({ score: 12, percentile: 40, coinsEarned: 5, balance: 35 }),
      flush: async () => 0,
      pending: async () => [],
    };

    const outcome = await savePlay(queue, play);
    assert.equal(outcome.saveState, "saved");
    assert.equal(outcome.coinsEarned, 5);
    assert.equal(outcome.balance, 35);
  });

  it("omits coin fields when the play stays queued", async () => {
    const queue: SubmitQueue<{ score: number; percentile: number }> = {
      submit: async () => {
        throw new Error("offline");
      },
      flush: async () => 0,
      pending: async () => [],
    };

    const outcome = await savePlay(queue, play);
    assert.equal(outcome.saveState, "queued");
    assert.equal(outcome.coinsEarned, undefined);
    assert.equal(outcome.balance, undefined);
  });
});
