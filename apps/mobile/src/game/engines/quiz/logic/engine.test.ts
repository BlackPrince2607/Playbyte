import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRng } from "../../../core/rng";
import { definition, packBundle, playHeadless } from "../../../testing/harness";
import { guessEngine } from "../../guess/logic/engine";
import { normLabel, pickDistractors } from "./distractors";
import type { QuizAction, QuizState } from "./types";

const content = packBundle("flag");
const def = (extra: Record<string, unknown> = {}) => definition({ engine: "guess", variation: "flag", roundCount: 8, ...extra });
const right = (s: QuizState): QuizAction | null => (s.q && !s.answer ? { type: "answer", optionId: s.q.answerId } : null);
const wrong = (s: QuizState): QuizAction | null =>
  s.q && !s.answer ? { type: "answer", optionId: s.q.options.find((o) => o.id !== s.q!.answerId)!.id } : null;

describe("quiz core", () => {
  it("builds questions with the right option count, unique labels and the answer present", () => {
    for (const [level, n] of [
      [0, 3],
      [1, 5],
    ] as const) {
      const { runner } = playHeadless({ engine: guessEngine, definition: def({ difficulty: { start: level, controller: "fixed" } }), content, pickAction: right, stopAfter: 0 });
      const q = runner.getSnapshot().state.q!;
      assert.equal(q.options.length, n);
      assert.ok(q.options.some((o) => o.id === q.answerId));
      assert.equal(new Set(q.options.map((o) => normLabel(o.label))).size, n);
    }
  });

  it("perfect play scores the maximum band and never repeats an item", () => {
    const { runner } = playHeadless({ engine: guessEngine, definition: def(), content, pickAction: right });
    const snap = runner.getSnapshot();
    assert.equal(snap.status, "completed");
    assert.equal(snap.result?.correct, 8);
    assert.ok(snap.score > 8 * 10);
    const ids = runner.serialize().actions.length;
    assert.equal(ids, 8);
  });

  it("times out unanswered questions as wrong with no points", () => {
    const { runner } = playHeadless({ engine: guessEngine, definition: def({ timeLimitSec: 2 }), content, pickAction: () => null, stepMs: 500, maxSteps: 200 });
    const snap = runner.getSnapshot();
    assert.equal(snap.status, "completed");
    assert.equal(snap.score, 0);
    assert.equal(snap.result?.attempts, 8);
  });

  it("ends early when lives run out", () => {
    const { runner } = playHeadless({ engine: guessEngine, definition: def({ lives: 2, roundCount: 10 }), content, pickAction: wrong });
    const snap = runner.getSnapshot();
    assert.equal(snap.status, "completed");
    assert.equal(snap.result?.attempts, 2);
    assert.equal(snap.lives, 0);
  });

  it("50/50 removes half the wrong options and clue hints reveal more and cost points", () => {
    const { runner } = playHeadless({ engine: guessEngine, definition: def({ difficulty: { start: 1, controller: "fixed" } }), content, pickAction: right, stopAfter: 0 });
    const before = runner.getSnapshot();
    assert.deepEqual(before.hints.map((h) => h.id).sort(), ["clue", "fifty"]);
    assert.equal(runner.useHint("fifty").accepted, true);
    const s = runner.getSnapshot().state;
    assert.equal(s.eliminated.length, 2);
    assert.ok(!s.eliminated.includes(s.q!.answerId));
    assert.equal(runner.dispatch({ type: "answer", optionId: s.eliminated[0] }).accepted, false);
    assert.equal(runner.useHint("clue").accepted, true);
    assert.equal(runner.getSnapshot().state.revealed, before.state.revealed + 1);
    runner.dispatch({ type: "answer", optionId: s.q!.answerId });
    assert.equal(runner.getSnapshot().state.breakdown.hints, -6);
  });

  it("limits rounds to the available pool", () => {
    const small = { ...content, items: content.items.slice(0, 5) };
    const { runner } = playHeadless({ engine: guessEngine, definition: def({ roundCount: 20 }), content: small, pickAction: right });
    assert.equal(runner.getSnapshot().result?.attempts, 5);
  });

  it("harder levels draw distractors from the answer's own group more often", () => {
    const pool = playHeadless({ engine: guessEngine, definition: def(), content, pickAction: right, stopAfter: 0 }).runner.getSnapshot().state.pool;
    const share = (similarity: number) => {
      let same = 0;
      let total = 0;
      for (let i = 0; i < 200; i++) {
        const item = pool[i % pool.length];
        const opts = pickDistractors(item, pool, 3, similarity, createRng(`d${i}`));
        for (const o of opts) {
          total++;
          if (pool.find((p) => p.id === o.id)?.group === item.group) same++;
        }
      }
      return same / total;
    };
    assert.ok(share(0.9) > share(0.1) + 0.3);
  });

  it("adapts difficulty upward for a strong player", () => {
    const { runner } = playHeadless({ engine: guessEngine, definition: def({ roundCount: 10 }), content, pickAction: right, stepMs: 300 });
    assert.ok(runner.getSnapshot().level > 0.3);
  });
});
