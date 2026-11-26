import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { selectItems } from "../../../content/query";
import { createRng } from "../../../core/rng";
import { definition, packBundle, playHeadless, runConformance } from "../../../testing/harness";
import { spotMeta } from "../meta";
import { MIN_REGION, inRegion, selectDiffs } from "./differences";
import { SpotAction, SpotState, TOUCH_SLOP } from "./engine";
import { pairFromItem } from "./pairs";
import { ASPECT } from "./scene";
import { spotEngine } from "./spot";

const bundle = packBundle("spot_pair");

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
    content: bundle,
    pickAction: player,
    stepMs: 2000,
    invalidAction: () => ({ type: "tap", x: 2, y: 0.1 }),
    finite: true,
  });
}

const params = (lvl: number) => spotEngine.difficulty.paramsFor(lvl);

describe("spot_pair content", () => {
  it("every variation has enough pairs and every pair parses", () => {
    for (const item of bundle.items) assert.ok(pairFromItem(item), item.id);
    for (const v of spotMeta.variations) {
      const [need] = spotEngine.contentNeeds(definition({ engine: "spot_difference", variation: v.id }));
      assert.ok(selectItems(bundle, need).length >= 3, v.id);
    }
  });

  it("requires distinct left/right art and never invents stamp overlays", () => {
    const base = bundle.items[0];
    const pair = pairFromItem(base)!;
    assert.notEqual(pair.leftUrl, pair.rightUrl);
    assert.equal(pair.overlays.length, 0);
    assert.equal(
      pairFromItem({
        ...base,
        attributes: { ...base.attributes, leftUrl: pair.leftUrl, rightUrl: pair.leftUrl },
      }),
      null,
    );
  });

  it("rejects malformed pairs", () => {
    const base = bundle.items[0];
    assert.equal(pairFromItem({ ...base, media: [], attributes: { ...base.attributes, leftUrl: "", rightUrl: "" } }), null);
    assert.equal(pairFromItem({ ...base, attributes: { ...base.attributes, diffs: [] } }), null);
    assert.equal(
      pairFromItem({
        ...base,
        attributes: {
          ...base.attributes,
          diffs: [
            { id: "a", x: 0.2, y: 0.2, hw: 0.06, hh: 0.06 },
            { id: "b", x: 0.21, y: 0.2, hw: 0.06, hh: 0.06 },
            { id: "c", x: 0.8, y: 0.4, hw: 0.06, hh: 0.06 },
          ],
        },
      }),
      null,
    );
  });
});

describe("selectDiffs", () => {
  it("can still subset authored regions when asked (legacy helper)", () => {
    for (const item of bundle.items) {
      const pair = pairFromItem(item)!;
      for (const lvl of [0, 0.5, 1]) {
        const p = params(lvl);
        const rng = createRng(`${item.id}-${lvl}`);
        const diffs = selectDiffs(pair.diffs, p, rng);
        assert.equal(diffs.length, Math.min(p.diffCount, pair.diffs.length));
        for (const d of diffs) {
          assert.ok(d.hw >= MIN_REGION && d.hh >= MIN_REGION);
          assert.ok(d.x >= 0 && d.x <= 1 && d.y >= 0 && d.y <= ASPECT);
        }
      }
    }
  });
});

describe("rounds expose every baked difference", () => {
  it("does not hide painted diffs behind a difficulty subset", () => {
    const { runner } = playHeadless({
      engine: spotEngine,
      definition: definition({ engine: "spot_difference", variation: "city", difficulty: { start: 0 } }),
      content: bundle,
      pickAction: () => null,
      stopAfter: 0,
    });
    const s = runner.getSnapshot().state;
    const pair = s.pool.find((p) => p.id === s.pairId)!;
    assert.equal(s.diffs.length, pair.diffs.length);
    assert.ok(s.diffs.length >= 3);
  });
});

describe("spot the difference rules", () => {
  const start = (extra: Record<string, unknown> = {}) =>
    playHeadless({
      engine: spotEngine,
      definition: definition({ engine: "spot_difference", variation: "shapes", ...extra }),
      content: bundle,
      pickAction: () => null,
      stopAfter: 0,
    });

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

  it("rounds expose distinct media urls with no stamp overlays", () => {
    const { runner } = start();
    const s = runner.getSnapshot().state;
    assert.match(s.leftUrl, /^(https:\/\/|asset:spot\/)/);
    assert.match(s.rightUrl, /^(https:\/\/|asset:spot\/)/);
    assert.notEqual(s.leftUrl, s.rightUrl);
    assert.equal(s.overlays.length, 0);
  });
});
