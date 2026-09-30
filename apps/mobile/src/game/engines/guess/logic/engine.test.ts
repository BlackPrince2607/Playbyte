import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { definition, packBundle, playHeadless, runConformance } from "../../../testing/harness";
import type { QuizAction, QuizState } from "../../quiz/logic/types";
import { guessMeta } from "../meta";
import { guessEngine } from "./engine";

const pick = (s: QuizState, rng: { chance(p: number): boolean; pick<T>(x: readonly T[]): T }): QuizAction | null =>
  s.q && !s.answer ? { type: "answer", optionId: rng.chance(0.7) ? s.q.answerId : rng.pick(s.q.options).id } : null;

const LIVE = guessMeta.variations.filter((v) => v.available !== false).map((v) => v.id);

for (const variation of LIVE) {
  runConformance({
    name: `guess/${variation}`,
    engine: guessEngine,
    definition: definition({ engine: "guess", variation, roundCount: 6 }),
    content: packBundle(variation),
    pickAction: pick,
    invalidAction: () => ({ type: "answer", optionId: "__nope__" }),
    finite: true,
  });
}

describe("guess variations", () => {
  it("ships flag, indian_state, food and landmark; gates the rest", () => {
    assert.deepEqual(LIVE, ["flag", "indian_state", "food", "landmark"]);
    const gated = definition({ engine: "guess", variation: "logo" });
    assert.equal(guessEngine.checkDefinition(gated).ok, false);
  });

  it("each live pack has enough content for a full game", () => {
    for (const variation of LIVE) {
      const def = definition({ engine: "guess", variation });
      const [need] = guessEngine.contentNeeds(def);
      const bundle = packBundle(variation);
      assert.ok(bundle.items.length >= 10 && bundle.items.length >= need.min, variation);
    }
  });

  it("text-clue variations start with fewer clues at higher levels", () => {
    const shown = (level: number) =>
      playHeadless({
        engine: guessEngine,
        definition: definition({ engine: "guess", variation: "indian_state", difficulty: { start: level, controller: "fixed" } }),
        content: packBundle("indian_state"),
        pickAction: () => null,
        stopAfter: 0,
      }).runner.getSnapshot().state.revealed;
    assert.equal(shown(0), 3);
    assert.equal(shown(1), 1);
  });

  it("respects a category filter from the definition", () => {
    const { runner } = playHeadless({
      engine: guessEngine,
      definition: definition({ engine: "guess", variation: "food", category: "world" }),
      content: packBundle("food"),
      pickAction: () => null,
      stopAfter: 0,
    });
    const s = runner.getSnapshot().state;
    assert.ok(s.pool.length > 0 && s.pool.every((p) => p.id.startsWith("food.")));
    assert.equal(s.pool.length, 6);
  });
});
