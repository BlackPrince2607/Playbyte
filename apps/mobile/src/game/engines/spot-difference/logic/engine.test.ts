import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRng } from "../../../core/rng";
import { definition, playHeadless, runConformance } from "../../../testing/harness";
import { spotMeta } from "../meta";
import { MIN_REGION, inRegion, makeDifferences } from "./differences";
import { SpotAction, SpotState, TOUCH_SLOP } from "./engine";
import { ASPECT, THEMES, hexToHsl, hslToHex } from "./scene";
import { spotEngine } from "./spot";

const player = (s: SpotState, rng: { chance(p: number): boolean; pick<T>(x: readonly T[]): T; next(): number }): SpotAction | null => {
  if (s.roundOver) return null;
  const left = s.diffs.filter((d) => !s.found.includes(d.id));
  if (!left.length) return null;
  if (rng.chance(0.25)) return { type: "tap", x: rng.next(), y: rng.next() * ASPECT };
  const d = rng.pick(left);
  return { type: "tap", x: d.x, y: d.y };
};

for (const v of spotMeta.variations) {
  runConformance({
    name: `spot_difference/${v.id}`,
    engine: spotEngine,
    definition: definition({ engine: "spot_difference", variation: v.id }),
    pickAction: player,
    stepMs: 2000,
    invalidAction: () => ({ type: "tap", x: 2, y: 0.1 }),
    finite: true,
  });
}

const params = (lvl: number) => spotEngine.difficulty.paramsFor(lvl);

describe("DifferenceGenerator", () => {
  it("produces the requested number of separated, in-bounds differences for every theme and level", () => {
    for (const theme of Object.keys(THEMES)) {
      for (const lvl of [0, 0.5, 1]) {
        let total = 0;
        for (let i = 0; i < 15; i++) {
          const rng = createRng(`${theme}-${lvl}-${i}`);
          const p = params(lvl);
          const { left, right, diffs } = makeDifferences(THEMES[theme](rng, p.shapeCount), p, rng);
          total += diffs.length;
          for (const d of diffs) {
            assert.ok(d.hw >= MIN_REGION && d.hh >= MIN_REGION);
            assert.ok(d.x >= 0 && d.x <= 1 && d.y >= 0 && d.y <= ASPECT);
          }
          for (let a = 0; a < diffs.length; a++)
            for (let b = a + 1; b < diffs.length; b++) {
              const [p, q] = [diffs[a], diffs[b]];
              assert.ok(Math.abs(p.x - q.x) >= p.hw + q.hw - 1e-9 || Math.abs(p.y - q.y) >= p.hh + q.hh - 1e-9, `${theme} regions overlap`);
            }
          for (const sh of [...left.shapes, ...right.shapes]) {
            assert.ok(sh.x - sh.hw >= -1e-9 && sh.x + sh.hw <= 1 + 1e-9, `${theme} shape out of bounds`);
          }
        }
        assert.ok(total / 15 >= params(lvl).diffCount - 1, `${theme}@${lvl}: avg ${total / 15}`);
      }
    }
  });

  it("the two pictures really differ where the regions are", () => {
    const rng = createRng("real");
    const p = params(0.5);
    const { left, right, diffs } = makeDifferences(THEMES.shapes(rng, p.shapeCount), p, rng);
    const sig = (s: { shapes: { id: number; x: number; y: number; hw: number; hh: number; rot: number; color: string; kind: string }[] }, id: number) =>
      JSON.stringify(s.shapes.find((x) => x.id === id) ?? null);
    for (const d of diffs) {
      const id = Number(d.id.slice(1));
      assert.notEqual(sig(left, id), sig(right, id), d.kind);
    }
  });

  it("colour helpers round-trip", () => {
    for (const hex of ["#ff4d8d", "#c6ff3d", "#1b1440", "#ffffff"]) {
      const [h, s, l] = hexToHsl(hex);
      assert.equal(hslToHex(h, s, l), hex);
    }
  });
});

describe("spot the difference rules", () => {
  const start = (extra: Record<string, unknown> = {}) =>
    playHeadless({ engine: spotEngine, definition: definition({ engine: "spot_difference", variation: "shapes", ...extra }), pickAction: () => null, stopAfter: 0 });

  it("tapping inside a region finds it; tapping again is harmless", () => {
    const { runner } = start();
    const d = runner.getSnapshot().state.diffs[0];
    runner.dispatch({ type: "tap", x: d.x + d.hw * 0.5, y: d.y });
    const s = runner.getSnapshot().state;
    assert.deepEqual(s.found, [d.id]);
    assert.ok(s.score > 0);
    runner.dispatch({ type: "tap", x: d.x, y: d.y });
    assert.equal(runner.getSnapshot().state.misses, 0);
  });

  it("slop allows slightly-off taps; far taps are misses with a penalty", () => {
    const { runner } = start();
    const s0 = runner.getSnapshot().state;
    const d = s0.diffs[0];
    runner.dispatch({ type: "tap", x: Math.min(1, d.x + d.hw + TOUCH_SLOP * 0.5), y: d.y });
    assert.equal(runner.getSnapshot().state.found.length, 1);
    const far = { x: d.x > 0.5 ? 0.01 : 0.99, y: d.y > ASPECT / 2 ? 0.01 : ASPECT - 0.01 };
    const isNear = s0.diffs.some((o) => inRegion(o, far.x, far.y, TOUCH_SLOP));
    if (!isNear) {
      const before = runner.getSnapshot().state.score;
      runner.dispatch({ type: "tap", ...far });
      const after = runner.getSnapshot().state;
      assert.equal(after.misses, 1);
      assert.ok(after.score < before);
      assert.equal(after.streak, 0);
    }
  });

  it("finding everything ends the round with a time bonus", () => {
    const { runner } = start({ roundCount: 2 });
    for (const d of runner.getSnapshot().state.diffs) runner.dispatch({ type: "tap", x: d.x, y: d.y });
    const snap = runner.getSnapshot();
    assert.equal(snap.status, "roundOver");
    assert.ok(snap.state.breakdown.clear > 0);
  });

  it("the hint reveals one unfound difference and the find then costs points", () => {
    const { runner } = start();
    runner.useHint("reveal");
    const s = runner.getSnapshot().state;
    assert.equal(s.revealed.length, 1);
    const d = s.diffs.find((x) => x.id === s.revealed[0])!;
    runner.dispatch({ type: "tap", x: d.x, y: d.y });
    assert.ok(runner.getSnapshot().state.breakdown.hints < 0);
  });

  it("time running out closes the round without a bonus", () => {
    const { runner, clock } = start({ roundCount: 2 });
    clock.advance(runner.getSnapshot().state.roundLimitMs + 5);
    runner.tick();
    assert.equal(runner.getSnapshot().status, "roundOver");
    assert.equal(runner.getSnapshot().state.breakdown.clear, undefined);
  });
});
