import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { definition, playHeadless, runConformance } from "../../../testing/harness";
import { visibleTargets } from "../../tap/logic/spawn";
import type { TapAction, TapState } from "../../tap/logic/types";
import { tapDontTapMeta } from "../meta";
import { tapDontTapEngine } from "./tapDontTap";

/** Taps only targets (never decoys) most of the time. */
const careful = (s: TapState, rng: { chance(p: number): boolean; pick<T>(x: readonly T[]): T }, now: number): TapAction | null => {
  if (s.roundOver) return null;
  const vis = visibleTargets(s.targets, s.done, now).filter((t) => t.kind !== "decoy");
  if (!vis.length) return null;
  return rng.chance(0.85) ? { type: "tap", id: rng.pick(vis).id } : null;
};

for (const v of tapDontTapMeta.variations) {
  runConformance({
    name: `tap_dont_tap/${v.id}`,
    engine: tapDontTapEngine,
    definition: definition({ engine: "tap_dont_tap", variation: v.id }),
    pickAction: careful,
    stepMs: 100,
    invalidAction: () => ({ type: "tap", id: 99_999 }),
    finite: true,
  });
}

const start = (variation: string, extra: Record<string, unknown> = {}) =>
  playHeadless({ engine: tapDontTapEngine, definition: definition({ engine: "tap_dont_tap", variation, ...extra }), pickAction: () => null, stopAfter: 0 });

describe("tap / don't tap", () => {
  it("serves plenty of decoys drawn from the avoid list", () => {
    const s = start("fruit").runner.getSnapshot().state;
    const decoys = s.targets.filter((t) => t.kind === "decoy");
    assert.ok(decoys.length / s.targets.length > 0.15, `${decoys.length}/${s.targets.length}`);
    assert.ok(decoys.every((t) => s.rule!.avoid.includes(t.emoji!)));
    assert.ok(s.targets.filter((t) => t.kind === "target").every((t) => s.rule!.tap.includes(t.emoji!)));
  });

  it("tapping a decoy costs points, the streak and a life", () => {
    const { runner, clock } = start("balloons", { lives: 3 });
    const s0 = runner.getSnapshot().state;
    const decoy = s0.targets.find((t) => t.kind === "decoy")!;
    clock.advance(decoy.at - clock.now() + 10);
    runner.tick();
    const r = runner.dispatch({ type: "tap", id: decoy.id });
    assert.ok(r.accepted);
    const s = runner.getSnapshot().state;
    assert.equal(s.misses, 1);
    assert.equal(s.streak, 0);
    assert.equal(s.lives, 2);
  });

  it("letting decoys expire is free and counted as avoided", () => {
    const { runner } = playHeadless({
      engine: tapDontTapEngine,
      definition: definition({ engine: "tap_dont_tap", variation: "balloons", roundCount: 1, lives: 3 }),
      pickAction: careful,
      stepMs: 100,
    });
    const s = runner.getSnapshot().state;
    assert.ok(s.avoided > 0);
    assert.equal(s.misses, 0);
  });

  it("the flip variation swaps the rule every round and flags it", () => {
    const { runner } = playHeadless({
      engine: tapDontTapEngine,
      definition: definition({ engine: "tap_dont_tap", variation: "flip", roundCount: 2 }),
      pickAction: careful,
      stepMs: 100,
      stopAfter: 400,
    });
    const s = runner.getSnapshot().state;
    assert.equal(s.round, 2);
    assert.equal(s.ruleFlipped, true);
    assert.deepEqual(s.rule!.tap, ["🔴"]);
    const first = start("flip").runner.getSnapshot().state;
    assert.deepEqual(first.rule!.tap, ["🟢"]);
    assert.equal(first.ruleFlipped, false);
  });
});
