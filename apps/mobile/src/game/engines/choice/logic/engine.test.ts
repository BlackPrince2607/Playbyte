import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { selectItems } from "../../../content/query";
import { definition, packBundle, playHeadless, runConformance } from "../../../testing/harness";
import { choiceMeta } from "../meta";
import { choiceEngine } from "./choice";
import { AGREEMENT_MAX, ChoiceAction, ChoiceState, PARTICIPATION, SYNC_STREAK, pairFromItem, splitDifficulty } from "./engine";

const bundle = packBundle("choice_pair");
const pick = (s: ChoiceState, rng: { chance(p: number): boolean }): ChoiceAction | null =>
  s.q && !s.pick ? { type: "pick", side: rng.chance(0.5) ? "a" : "b" } : null;

for (const v of choiceMeta.variations) {
  runConformance({
    name: `choice/${v.id}`,
    engine: choiceEngine,
    definition: definition({ engine: "choice", variation: v.id }),
    content: bundle,
    pickAction: pick,
    invalidAction: () => ({ type: "pick", side: "c" as "a" }),
    finite: true,
  });
}

const start = (variation: string, extra: Record<string, unknown> = {}) =>
  playHeadless({ engine: choiceEngine, definition: definition({ engine: "choice", variation, ...extra }), content: bundle, pickAction: () => null, stopAfter: 0 }).runner;

describe("choice content", () => {
  it("every variation has enough pairs and every pair parses", () => {
    for (const item of bundle.items) assert.ok(pairFromItem(item), item.id);
    for (const v of choiceMeta.variations) {
      const [need] = choiceEngine.contentNeeds(definition({ engine: "choice", variation: v.id }));
      assert.ok(selectItems(bundle, need).length >= 10, v.id);
    }
  });

  it("rejects malformed pairs", () => {
    const base = bundle.items[0];
    assert.equal(pairFromItem({ ...base, attributes: { ...base.attributes, split: "lots" } }), null);
    assert.equal(pairFromItem({ ...base, attributes: { ...base.attributes, b: { label: "chai" } } }), null);
    assert.equal(pairFromItem({ ...base, attributes: { a: { label: "x" }, split: 50 } }), null);
  });

  it("close splits are harder to predict", () => {
    assert.equal(splitDifficulty(50), 1);
    assert.equal(splitDifficulty(100), 0);
    assert.ok(splitDifficulty(55) > splitDifficulty(80));
  });
});

describe("prefer mode scoring", () => {
  it("scores participation plus agreement, never zero for a pick", () => {
    const runner = start("this_or_that");
    const q = runner.getSnapshot().state.q!;
    const minority = q.split >= 50 ? "b" : "a";
    runner.dispatch({ type: "pick", side: minority });
    const s = runner.getSnapshot().state;
    const agree = minority === "a" ? q.split : 100 - q.split;
    assert.equal(s.pick!.agreePct, agree);
    assert.equal(s.score, PARTICIPATION + Math.floor((AGREEMENT_MAX * agree) / 100));
    assert.ok(s.score >= PARTICIPATION);
  });

  it("siding with the crowd builds a sync streak", () => {
    const { runner } = playHeadless({
      engine: choiceEngine,
      definition: definition({ engine: "choice", variation: "this_or_that", roundCount: 8 }),
      content: bundle,
      pickAction: (s: ChoiceState) => (s.q && !s.pick ? { type: "pick", side: s.q.split >= 50 ? "a" : "b" } : null),
    });
    const s = runner.getSnapshot().state;
    assert.equal(s.correct, 8);
    assert.ok(s.breakdown.streak > 0 && s.breakdown.streak <= 8 * SYNC_STREAK.cap);
    assert.ok(s.score <= choiceEngine.maxScore(definition({ engine: "choice", variation: "this_or_that", roundCount: 8 })));
  });

  it("a timeout scores nothing", () => {
    const { runner, clock } = playHeadless({
      engine: choiceEngine,
      definition: definition({ engine: "choice", variation: "desi" }),
      content: bundle,
      pickAction: () => null,
      stopAfter: 0,
    });
    clock.advance(10_001);
    runner.tick();
    const s = runner.getSnapshot().state;
    assert.equal(s.pick?.side, null);
    assert.equal(s.score, 0);
  });

  it("vote names the content item's side even when the pair is shown swapped", () => {
    const byId = new Map(bundle.items.map((i) => [i.id, i]));
    let swapped = 0;
    for (let i = 0; i < 12; i++) {
      const { runner, events } = playHeadless({
        engine: choiceEngine,
        definition: definition({ engine: "choice", variation: "this_or_that" }),
        content: bundle,
        seed: `vote-${i}`,
        pickAction: () => null,
        stopAfter: 0,
      });
      const q = runner.getSnapshot().state.q!;
      if (q.swapped) swapped++;
      runner.dispatch({ type: "pick", side: "a" });
      const ev = events.find((e) => e.name === "choice_pick")!;
      const vote = ev.props!.vote as "a" | "b";
      const option = byId.get(q.id)!.attributes[vote] as { label: string };
      assert.equal(option.label, q.a.label);
    }
    assert.ok(swapped > 0 && swapped < 12);
  });

  it("category variations only serve matching pairs", () => {
    const s = start("food_fight").getSnapshot().state;
    const food = new Set(bundle.items.filter((i) => i.categories.includes("food")).map((i) => i.id));
    assert.ok(s.pool.length > 0 && s.pool.every((p) => food.has(p.id)));
  });
});

describe("predict mode", () => {
  it("picking the majority is correct and scores; the minority scores zero", () => {
    const a = start("crowd");
    const qa = a.getSnapshot().state.q!;
    a.dispatch({ type: "pick", side: qa.split >= 50 ? "a" : "b" });
    assert.ok(a.getSnapshot().state.score > 0);
    assert.equal(a.getSnapshot().state.correct, 1);

    const b = playHeadless({ engine: choiceEngine, definition: definition({ engine: "choice", variation: "crowd" }), content: bundle, seed: "x", pickAction: () => null, stopAfter: 0 }).runner;
    const qb = b.getSnapshot().state.q!;
    if (qb.split !== 50) {
      b.dispatch({ type: "pick", side: qb.split > 50 ? "b" : "a" });
      assert.equal(b.getSnapshot().state.score, 0);
      assert.equal(b.getSnapshot().state.streak, 0);
    }
  });

  it("sides are shuffled so the favourite is not always first", () => {
    let aFav = 0;
    for (let i = 0; i < 30; i++) {
      const q = playHeadless({ engine: choiceEngine, definition: definition({ engine: "choice", variation: "crowd" }), content: bundle, seed: `side-${i}`, pickAction: () => null, stopAfter: 0 }).runner.getSnapshot().state.q!;
      if (q.split > 50) aFav++;
    }
    assert.ok(aFav > 5 && aFav < 25, `${aFav}`);
  });
});
