import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { selectItems } from "../../../content/query";
import { definition, packBundle, playHeadless, runConformance } from "../../../testing/harness";
import type { QuizAction, QuizState } from "../../quiz/logic/types";
import { factFakeMeta } from "../meta";
import { FACT_ID, FAKE_ID, factFakeEngine } from "./engine";

const pick = (s: QuizState, rng: { chance(p: number): boolean }): QuizAction | null =>
  s.q && !s.answer ? { type: "answer", optionId: rng.chance(0.7) ? s.q.answerId : s.q.answerId === FACT_ID ? FAKE_ID : FACT_ID } : null;

const bundle = packBundle("fact");

for (const v of factFakeMeta.variations) {
  runConformance({
    name: `fact_fake/${v.id}`,
    engine: factFakeEngine,
    definition: definition({ engine: "fact_fake", variation: v.id }),
    content: bundle,
    pickAction: pick,
    invalidAction: () => ({ type: "answer", optionId: "maybe" }),
    finite: true,
  });
}

describe("fact or fake", () => {
  it("every variation has enough statements for a full game", () => {
    for (const v of factFakeMeta.variations) {
      const [need] = factFakeEngine.contentNeeds(definition({ engine: "fact_fake", variation: v.id }));
      const n = selectItems(bundle, need).length;
      assert.ok(n >= 10 && n >= need.min, `${v.id}: ${n}`);
    }
  });

  it("pack items each carry a true and a fake statement with explanations", () => {
    for (const item of bundle.items) {
      const facts = item.facts ?? [];
      assert.ok(facts.some((f) => f.isTrue) && facts.some((f) => !f.isTrue), item.id);
      assert.ok(facts.every((f) => f.explanation && f.explanation.length > 10), item.id);
    }
  });

  it("cards are two-option, balanced between fact and fake, and show the statement", () => {
    let facts = 0;
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const { runner } = playHeadless({
        engine: factFakeEngine,
        definition: definition({ engine: "fact_fake", variation: "mixed", roundCount: 10 }),
        content: bundle,
        seed: `bal-${i}`,
        pickAction: (s: QuizState) => (s.q && !s.answer ? { type: "answer", optionId: s.q.answerId } : null),
      });
      const s = runner.getSnapshot().state;
      assert.equal(s.correct, 10);
      total += 1;
      if (s.q!.answerId === FACT_ID) facts += 1;
      assert.deepEqual(s.q!.options.map((o) => o.id).sort(), [FACT_ID, FAKE_ID].sort());
      assert.ok(s.q!.prompt.length >= 5 && s.q!.explanation);
    }
    assert.ok(facts > 3 && facts < total - 3, `facts ${facts}/${total}`);
  });

  it("offers no hints and times out to a wrong answer", () => {
    const { runner, clock } = playHeadless({
      engine: factFakeEngine,
      definition: definition({ engine: "fact_fake", variation: "science", difficulty: { start: 1, controller: "fixed" } }),
      content: bundle,
      pickAction: () => null,
      stopAfter: 0,
    });
    assert.deepEqual(runner.getSnapshot().hints, []);
    clock.advance(6_001);
    runner.tick();
    const s = runner.getSnapshot().state;
    assert.equal(s.answer?.optionId, null);
    assert.equal(s.answer?.correct, false);
  });
});
