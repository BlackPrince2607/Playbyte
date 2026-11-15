import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { definition, playHeadless, runConformance } from "../../../testing/harness";
import { CARD_COUNT, FLIP_BACK_MS, PAIR_COUNT } from "./faces";
import { deal, memoryEngine, type MemoryAction, type MemoryState } from "./engine";
import { createRng } from "../../../core/rng";

const def = () => definition({ engine: "memory", variation: "pairs", timeLimitSec: 45, maxScore: 1200 });

/** Always match when possible; otherwise flip the first face-down card. */
function pick(s: MemoryState): MemoryAction | null {
  if (s.roundOver || s.lockUntil !== null) return null;
  const down = s.cards.map((c, i) => ({ c, i })).filter((x) => !x.c.matched && !x.c.faceUp);
  if (!down.length) return null;
  if (s.firstIndex !== null) {
    const face = s.cards[s.firstIndex].face;
    const match = down.find((x) => x.c.face === face);
    if (match) return { type: "flip", index: match.i };
  }
  return { type: "flip", index: down[0].i };
}

runConformance({
  name: "memory/pairs",
  engine: memoryEngine,
  definition: def(),
  pickAction: (s) => pick(s),
  invalidAction: () => ({ type: "flip", index: -1 }),
  finite: true,
  stepMs: 100,
});

describe("memory pairs", () => {
  it("deals eight cards as four pairs", () => {
    const { cards } = deal(createRng("deal"));
    assert.equal(cards.length, CARD_COUNT);
    const counts = new Map<string, number>();
    for (const c of cards) counts.set(c.face, (counts.get(c.face) ?? 0) + 1);
    assert.equal(counts.size, PAIR_COUNT);
    for (const n of counts.values()) assert.equal(n, 2);
  });

  it("matches a pair and clears the board", () => {
    const { runner, clock } = playHeadless({
      engine: memoryEngine,
      definition: def(),
      seed: "clear",
      pickAction: pick,
      stepMs: 80,
      maxSteps: 200,
    });
    void clock;
    const snap = runner.getSnapshot();
    assert.equal(snap.status, "completed");
    assert.ok(snap.state.cleared);
    assert.equal(snap.state.matches, PAIR_COUNT);
    assert.ok((snap.result?.score ?? 0) > 0);
  });

  it("flips mismatched cards back after the lock window", () => {
    const { runner, clock } = playHeadless({
      engine: memoryEngine,
      definition: def(),
      seed: "mismatch",
      pickAction: () => null,
      stopAfter: 0,
      stepMs: 50,
    });
    const s0 = runner.getSnapshot().state;
    const faces = s0.cards.map((c) => c.face);
    const a = 0;
    const b = faces.findIndex((f, i) => i > 0 && f !== faces[a]);
    assert.ok(b > 0);
    assert.ok(runner.dispatch({ type: "flip", index: a }).accepted);
    assert.ok(runner.dispatch({ type: "flip", index: b }).accepted);
    const mid = runner.getSnapshot().state;
    assert.equal(mid.cards[a].faceUp, true);
    assert.equal(mid.cards[b].faceUp, true);
    assert.ok(mid.lockUntil !== null);
    clock.advance(FLIP_BACK_MS + 20);
    runner.tick();
    const after = runner.getSnapshot().state;
    assert.equal(after.lockUntil, null);
    assert.equal(after.cards[a].faceUp, false);
    assert.equal(after.cards[b].faceUp, false);
  });
});
