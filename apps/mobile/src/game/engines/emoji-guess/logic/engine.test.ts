import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { definition, packBundle, playHeadless, runConformance } from "../../../testing/harness";
import type { QuizAction, QuizState } from "../../quiz/logic/types";
import { emojiGuessMeta } from "../meta";
import { EMOJI_STRATEGIES, emojiGuessEngine, shapeClue } from "./engine";

const pick = (s: QuizState, rng: { chance(p: number): boolean; pick<T>(x: readonly T[]): T }): QuizAction | null =>
  s.q && !s.answer ? { type: "answer", optionId: rng.chance(0.6) ? s.q.answerId : rng.pick(s.q.options).id } : null;

const LIVE = emojiGuessMeta.variations.filter((v) => v.available !== false).map((v) => v.id);
const packOf = (variation: string) => EMOJI_STRATEGIES[variation].types[0];

for (const variation of LIVE) {
  runConformance({
    name: `emoji_guess/${variation}`,
    engine: emojiGuessEngine,
    definition: definition({ engine: "emoji_guess", variation, roundCount: 6 }),
    content: packBundle(packOf(variation)),
    pickAction: pick,
    invalidAction: () => ({ type: "answer", optionId: "__nope__" }),
    finite: true,
  });
}

describe("emoji guess", () => {
  it("ships movie, phrase and word; gates song, celebrity and brand", () => {
    assert.deepEqual(LIVE, ["movie", "phrase", "word"]);
    for (const v of ["song", "celebrity", "brand"]) {
      assert.equal(emojiGuessEngine.checkDefinition(definition({ engine: "emoji_guess", variation: v })).ok, false);
    }
  });

  it("describes the answer shape", () => {
    assert.equal(shapeClue("Time is money"), '3 words · starts with "T"');
    assert.equal(shapeClue("Spider-Man"), '9 letters · starts with "S"');
    assert.equal(shapeClue("3 Idiots"), '2 words · starts with "3"');
  });

  it("leads with the emoji and ends every clue list with the shape clue", () => {
    const { runner } = playHeadless({
      engine: emojiGuessEngine,
      definition: definition({ engine: "emoji_guess", variation: "phrase" }),
      content: packBundle("emoji_phrase"),
      pickAction: () => null,
      stopAfter: 0,
    });
    const s = runner.getSnapshot().state;
    for (const p of s.pool) {
      assert.equal(p.clues[0].kind, "emoji");
      assert.match(p.clues[p.clues.length - 1].value, /starts with/);
    }
  });

  it("gives more time and fewer upfront clues than flag Guess", () => {
    const easy = emojiGuessEngine.difficulty.paramsFor(0);
    const hard = emojiGuessEngine.difficulty.paramsFor(1);
    assert.equal(easy.timeLimitMs, 20_000);
    assert.equal(hard.timeLimitMs, 9_000);
    assert.equal(easy.startClues, 2);
    assert.equal(hard.startClues, 1);
  });

  it("filters movies by category", () => {
    const { runner } = playHeadless({
      engine: emojiGuessEngine,
      definition: definition({ engine: "emoji_guess", variation: "movie", category: "hollywood" }),
      content: packBundle("emoji_movie"),
      pickAction: () => null,
      stopAfter: 0,
    });
    const s = runner.getSnapshot().state;
    assert.ok(s.pool.length >= 10);
    assert.ok(s.q && s.q.options.every((o) => s.pool.some((p) => p.id === o.id)));
  });

  it("each live pack supports a full game", () => {
    for (const variation of LIVE) {
      const bundle = packBundle(packOf(variation));
      const [need] = emojiGuessEngine.contentNeeds(definition({ engine: "emoji_guess", variation }));
      assert.ok(bundle.items.length >= Math.max(10, need.min), variation);
    }
  });
});
