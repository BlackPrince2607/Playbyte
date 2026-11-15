import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { definition, playHeadless, runConformance } from "../../../testing/harness";
import { laneDashEngine, type LaneDashAction, type LaneDashState } from "./engine";

const def = () =>
  definition({
    engine: "lane_dash",
    variation: "classic",
    timeLimitSec: 8,
    lives: 3,
    maxScore: 50_000,
  });

/** Dodge by moving away from the nearest approaching obstacle in our lane. */
function pick(s: LaneDashState): LaneDashAction | null {
  if (s.roundOver) return null;
  const threat = s.obstacles
    .filter((o) => o.lane === s.playerLane && o.y > 0.35 && o.y < 0.95)
    .sort((a, b) => b.y - a.y)[0];
  if (!threat) return null;
  const options = ([0, 1, 2] as const).filter((l) => l !== threat.lane);
  const safe = options.find((l) => !s.obstacles.some((o) => o.lane === l && o.y > 0.4 && o.y < 0.92));
  return { type: "lane", lane: safe ?? options[0] };
}

runConformance({
  name: "lane_dash/classic",
  engine: laneDashEngine,
  definition: def(),
  pickAction: (s) => pick(s),
  invalidAction: () => ({ type: "lane", lane: 9 as 0 }),
  finite: true,
  stepMs: 50,
  maxSteps: 800,
});

describe("lane dash", () => {
  it("completes a short timed run", () => {
    const { runner } = playHeadless({
      engine: laneDashEngine,
      definition: def(),
      seed: "survive",
      pickAction: pick,
      stepMs: 50,
      maxSteps: 800,
    });
    const snap = runner.getSnapshot();
    assert.equal(snap.status, "completed");
    assert.ok((snap.result?.score ?? 0) >= 0);
  });

  it("accepts lane changes", () => {
    const { runner } = playHeadless({
      engine: laneDashEngine,
      definition: def(),
      seed: "move",
      pickAction: () => null,
      stopAfter: 0,
      stepMs: 50,
    });
    assert.equal(runner.getSnapshot().state.playerLane, 1);
    assert.ok(runner.dispatch({ type: "lane", lane: 0 }).accepted);
    assert.equal(runner.getSnapshot().state.playerLane, 0);
    assert.ok(runner.dispatch({ type: "lane", lane: 2 }).accepted);
    assert.equal(runner.getSnapshot().state.playerLane, 2);
  });
});
