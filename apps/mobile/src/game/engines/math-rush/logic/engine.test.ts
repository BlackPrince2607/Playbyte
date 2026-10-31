import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRng } from "../../../core/rng";
import { definition, packBundle, playHeadless, runConformance } from "../../../testing/harness";
import type { QuizAction, QuizParams, QuizState } from "../../quiz/logic/types";
import { mathRushMeta } from "../meta";
import { mathRushEngine } from "./engine";
import { VERIFY_NO, VERIFY_YES, bandFor, distractors, makeProblem, mathQuestion } from "./problems";

const pick = (s: QuizState, rng: { chance(p: number): boolean; pick<T>(x: readonly T[]): T }): QuizAction | null =>
  s.q && !s.answer ? { type: "answer", optionId: rng.chance(0.65) ? s.q.answerId : rng.pick(s.q.options).id } : null;

for (const v of mathRushMeta.variations) {
  runConformance({
    name: `math_rush/${v.id}`,
    engine: mathRushEngine,
    definition: definition({ engine: "math_rush", variation: v.id, roundCount: 8 }),
    content: packBundle(),
    pickAction: pick,
    invalidAction: () => ({ type: "answer", optionId: "__nope__" }),
    finite: true,
  });
}

const params = (d: number, optionCount = 4): QuizParams => ({
  optionCount,
  similarity: 0.5,
  targetDifficulty: d,
  timeLimitMs: 6_000,
  startClues: 1,
});

describe("math rush problems", () => {
  it("bands climb with difficulty", () => {
    assert.equal(bandFor(0), 0);
    assert.equal(bandFor(0.35), 1);
    assert.equal(bandFor(0.55), 2);
    assert.equal(bandFor(0.75), 3);
    assert.equal(bandFor(0.9), 4);
  });

  it("every generated problem has a finite non-negative integer answer", () => {
    const rng = createRng("math-rush-problems");
    for (let i = 0; i < 80; i++) {
      const p = makeProblem(rng, i / 80);
      assert.ok(Number.isInteger(p.answer) && p.answer >= 0, p.expression);
      assert.ok(p.expression.length > 2);
      assert.ok(p.traps.every((t) => Number.isFinite(t)));
    }
  });

  it("solve questions include the correct answer once among unique options", () => {
    const rng = createRng("math-rush-solve");
    for (let round = 1; round <= 40; round++) {
      const q = mathQuestion("solve")(rng, params(round / 40), round);
      const labels = q.options.map((o) => o.label);
      assert.equal(new Set(labels).size, labels.length, q.id);
      assert.equal(q.options.length, 4);
      const correct = q.options.find((o) => o.id === q.answerId);
      assert.ok(correct);
      assert.equal(correct!.label, q.explanation?.split(" = ").at(-1));
    }
  });

  it("verify questions are yes/no with a matching explanation", () => {
    const rng = createRng("math-rush-verify");
    for (let round = 1; round <= 30; round++) {
      const q = mathQuestion("verify")(rng, params(0.5, 2), round);
      assert.equal(q.options.length, 2);
      assert.ok(q.options.some((o) => o.id === VERIFY_YES));
      assert.ok(q.options.some((o) => o.id === VERIFY_NO));
      assert.ok(q.answerId === VERIFY_YES || q.answerId === VERIFY_NO);
      assert.ok(q.explanation);
    }
  });

  it("distractors never include the answer and stay unique", () => {
    const rng = createRng("math-rush-distractors");
    const wrong = distractors(rng, 42, [41, 43, 40, 48, 42], 3);
    assert.equal(wrong.length, 3);
    assert.ok(!wrong.includes(42));
    assert.equal(new Set(wrong).size, 3);
  });

  it("perfect play finishes with a positive score", () => {
    const { runner } = playHeadless({
      engine: mathRushEngine,
      definition: definition({ engine: "math_rush", variation: "solve", roundCount: 6 }),
      content: packBundle(),
      pickAction: (s) => (s.q && !s.answer ? { type: "answer", optionId: s.q.answerId } : null),
    });
    const snap = runner.getSnapshot();
    assert.equal(snap.status, "completed");
    assert.ok(snap.state.score > 0);
    assert.equal(snap.state.correct, 6);
  });

  it("blitz with lives ends early after three misses", () => {
    const { runner } = playHeadless({
      engine: mathRushEngine,
      definition: definition({ engine: "math_rush", variation: "blitz", roundCount: 15, lives: 3 }),
      content: packBundle(),
      pickAction: (s) => {
        if (!s.q || s.answer) return null;
        const wrong = s.q.options.find((o) => o.id !== s.q!.answerId);
        return { type: "answer", optionId: wrong?.id ?? s.q.answerId };
      },
    });
    const snap = runner.getSnapshot();
    assert.equal(snap.status, "completed");
    assert.equal(snap.state.lives, 0);
    assert.ok(snap.state.round <= 3);
  });
});
