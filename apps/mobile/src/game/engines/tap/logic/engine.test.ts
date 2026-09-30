import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRng } from "../../../core/rng";
import { definition, playHeadless, runConformance } from "../../../testing/harness";
import { tapMeta } from "../meta";
import { HIT_GRACE_MS, TAP_SCORING, reactionPoints } from "./engine";
import { spawnTargets, visibleTargets } from "./spawn";
import { tapEngine } from "./tap";
import type { TapAction, TapParams, TapState } from "./types";

/** Simulated player: taps a visible target most of the time, sometimes misses. */
const player = (s: TapState, rng: { chance(p: number): boolean; pick<T>(x: readonly T[]): T }, now: number): TapAction | null => {
  if (s.roundOver) return null;
  if (s.mode === "reaction") return s.goAt !== null && now >= s.goAt + 250 ? { type: "tap", id: null } : null;
  const vis = visibleTargets(s.targets, s.done, now).filter((t) => t.kind !== "decoy");
  if (!vis.length) return rng.chance(0.02) ? { type: "tap", id: null } : null;
  return rng.chance(0.85) ? { type: "tap", id: rng.pick(vis).id } : null;
};

for (const v of tapMeta.variations) {
  runConformance({
    name: `tap/${v.id}`,
    engine: tapEngine,
    definition: definition({ engine: "tap", variation: v.id }),
    pickAction: player,
    stepMs: 100,
    invalidAction: () => ({ type: "tap", id: 99_999 }),
    finite: true,
  });
}

const P = (over: Partial<TapParams> = {}): TapParams => ({ ...tapEngine.difficulty.paramsFor(0.5), ...over });
const def = (variation: string, extra: Record<string, unknown> = {}) => definition({ engine: "tap", variation, ...extra });

describe("TargetSpawnGenerator", () => {
  it("never exceeds maxAlive and keeps targets inside the field", () => {
    for (const lvl of [0, 0.5, 1]) {
      const p = tapEngine.difficulty.paramsFor(lvl);
      const ts = spawnTargets(createRng(`s${lvl}`), p, { start: 1000, roundMs: 12_000, firstId: 1, grid: 0 });
      assert.ok(ts.length > 5);
      for (const t of ts) {
        const alive = ts.filter((o) => o.at <= t.at && t.at < o.at + o.ttl).length;
        assert.ok(alive <= p.maxAlive, `alive ${alive} > ${p.maxAlive}`);
        for (const v of [t.x, t.y, t.x2, t.y2]) assert.ok(v >= t.r - 1e-9 && v <= 1 - t.r + 1e-9);
        assert.ok(t.at >= 1000 && t.at < 13_000);
      }
      assert.equal(new Set(ts.map((t) => t.id)).size, ts.length);
    }
  });

  it("grid layouts never stack live targets in one cell", () => {
    const p = P({ maxAlive: 5 });
    const ts = spawnTargets(createRng("g"), p, { start: 0, roundMs: 12_000, firstId: 1, grid: 3 });
    for (const t of ts) {
      const same = ts.filter((o) => o !== t && o.x === t.x && o.y === t.y && o.at <= t.at && t.at < o.at + o.ttl);
      assert.equal(same.length, 0);
      assert.equal(t.x, t.x2);
    }
  });

  it("harder levels spawn more, smaller, shorter-lived targets", () => {
    const count = (lvl: number) => spawnTargets(createRng("c"), tapEngine.difficulty.paramsFor(lvl), { start: 0, roundMs: 12_000, firstId: 1, grid: 0 });
    const easy = count(0);
    const hard = count(1);
    assert.ok(hard.length > easy.length);
    assert.ok(hard[0].r < easy[0].r && hard[0].ttl < easy[0].ttl);
  });

  it("mixes in decoys by ratio", () => {
    const ts = spawnTargets(createRng("d"), P({ decoyRatio: 0.4, bonusRatio: 0 }), { start: 0, roundMs: 60_000, firstId: 1, grid: 0 });
    const ratio = ts.filter((t) => t.kind === "decoy").length / ts.length;
    assert.ok(ratio > 0.25 && ratio < 0.55, String(ratio));
  });
});

describe("tap rules", () => {
  const start = (variation: string, extra: Record<string, unknown> = {}) =>
    playHeadless({ engine: tapEngine, definition: def(variation, extra), pickAction: () => null, stopAfter: 0 });

  it("a hit scores, extends the streak and resolves the target", () => {
    const { runner, clock } = start("rush");
    const s = runner.getSnapshot().state;
    const t = s.targets[0];
    clock.advance(t.at - clock.now() + 100);
    assert.equal(runner.dispatch({ type: "tap", id: t.id }).accepted, true);
    const after = runner.getSnapshot().state;
    assert.ok(after.score > 0 && after.streak === 1 && after.done.includes(t.id));
    assert.equal(runner.dispatch({ type: "tap", id: t.id }).accepted, false);
  });

  it("tapping empty space breaks the streak and costs points (never below 0)", () => {
    const { runner } = start("rush");
    runner.dispatch({ type: "tap", id: null });
    const s = runner.getSnapshot().state;
    assert.equal(s.score, 0);
    assert.equal(s.misses, 1);
    assert.equal(s.streak, 0);
  });

  it("targets that expire count as escaped", () => {
    const { runner, clock } = start("rush");
    const t = runner.getSnapshot().state.targets[0];
    clock.advance(t.at + t.ttl + HIT_GRACE_MS + 10 - clock.now());
    runner.tick();
    const s = runner.getSnapshot().state;
    assert.ok(s.escaped >= 1 && s.done.includes(t.id));
  });

  it("late taps within the grace window still hit", () => {
    const { runner, clock } = start("rush");
    const t = runner.getSnapshot().state.targets[0];
    clock.advance(t.at + t.ttl + HIT_GRACE_MS - 20 - clock.now());
    runner.dispatch({ type: "tap", id: t.id });
    assert.equal(runner.getSnapshot().state.hits, 1);
  });

  it("rounds end on time with an accuracy bonus", () => {
    const { runner, clock } = start("rush", { roundCount: 2 });
    const s = runner.getSnapshot().state;
    const t = s.targets[0];
    clock.advance(t.at + 50 - clock.now());
    runner.dispatch({ type: "tap", id: t.id });
    const scoreAfterHit = runner.getSnapshot().state.score;
    clock.advance(s.roundEnd - clock.now());
    runner.tick();
    const snap = runner.getSnapshot();
    assert.equal(snap.status, "roundOver");
    assert.ok(snap.state.breakdown.accuracy >= 0);
    assert.ok(snap.state.score >= scoreAfterHit);
  });

  it("lives end the game early", () => {
    const { runner } = start("rush", { lives: 2 });
    runner.dispatch({ type: "tap", id: null });
    runner.dispatch({ type: "tap", id: null });
    assert.equal(runner.getSnapshot().status, "completed");
  });

  it("reaction: false start scores nothing; a fast tap scores more than a slow one", () => {
    const early = start("reaction");
    early.runner.dispatch({ type: "tap", id: null });
    assert.equal(early.runner.getSnapshot().state.falseStart, true);
    assert.equal(early.runner.getSnapshot().state.score, 0);

    const score = (delay: number) => {
      const { runner, clock } = start("reaction");
      const s = runner.getSnapshot().state;
      clock.advance(s.goAt! + delay - clock.now());
      runner.dispatch({ type: "tap", id: null });
      return runner.getSnapshot().state;
    };
    const fast = score(200);
    const slow = score(600);
    assert.equal(fast.reactionMs, 200);
    assert.ok(fast.score > slow.score);
  });

  it("reaction: no tap before the window closes is too slow", () => {
    const { runner, clock } = start("reaction");
    const s = runner.getSnapshot().state;
    clock.advance(s.roundEnd + 1 - clock.now());
    runner.tick();
    const after = runner.getSnapshot().state;
    assert.equal(after.roundOver, true);
    assert.equal(after.reactionMs, null);
    assert.equal(after.falseStart, false);
  });

  it("reaction points fall from 100 to 0 across the window", () => {
    assert.equal(reactionPoints(100, 1000), 100);
    assert.equal(reactionPoints(1000, 1000), 0);
    assert.ok(reactionPoints(400, 1000) > reactionPoints(700, 1000));
  });

  it("uses tap-specific scoring defaults", () => {
    const { runner } = start("rush");
    assert.deepEqual(runner.getSnapshot().state.cfg, TAP_SCORING);
  });
});
