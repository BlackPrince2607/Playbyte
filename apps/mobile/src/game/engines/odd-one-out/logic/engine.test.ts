import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRng } from "../../../core/rng";
import { definition, packBundle, playHeadless, runConformance } from "../../../testing/harness";
import { normLabel } from "../../quiz/logic/distractors";
import type { QuizAction, QuizParams, QuizState } from "../../quiz/logic/types";
import { oddOneOutMeta } from "../meta";
import { oddOneOutEngine } from "./engine";
import { groupToPool, membersOf } from "./groups";
import { lookalikeQuestion } from "./lookalike";
import { NUMBER_RULES, numbersQuestion } from "./numbers";

const pick = (s: QuizState, rng: { chance(p: number): boolean; pick<T>(x: readonly T[]): T }): QuizAction | null =>
  s.q && !s.answer ? { type: "answer", optionId: rng.chance(0.6) ? s.q.answerId : rng.pick(s.q.options).id } : null;

const bundleFor = (variation: string) => (variation === "words" || variation === "emoji" ? packBundle("word_group") : packBundle());

for (const v of oddOneOutMeta.variations) {
  runConformance({
    name: `odd_one_out/${v.id}`,
    engine: oddOneOutEngine,
    definition: definition({ engine: "odd_one_out", variation: v.id, roundCount: 6 }),
    content: bundleFor(v.id),
    pickAction: pick,
    invalidAction: () => ({ type: "answer", optionId: "__nope__" }),
    finite: true,
  });
}

const params = (d: number, optionCount = 5): QuizParams => ({
  optionCount,
  similarity: 0.5,
  targetDifficulty: d,
  timeLimitMs: 10_000,
  startClues: 1,
});

describe("odd one out", () => {
  it("word groups are unambiguous: no word appears in two groups", () => {
    const seen = new Map<string, string>();
    for (const item of packBundle("word_group").items) {
      const p = groupToPool(false)(item);
      assert.ok(p, item.id);
      for (const m of membersOf(p)) {
        const k = normLabel(m.label);
        assert.ok(!seen.has(k), `${m.label} is in ${seen.get(k)} and ${item.id}`);
        seen.set(k, item.id);
      }
    }
  });

  it("exactly one card comes from another group, and it is the answer", () => {
    const { runner } = playHeadless({
      engine: oddOneOutEngine,
      definition: definition({ engine: "odd_one_out", variation: "words", roundCount: 10 }),
      content: packBundle("word_group"),
      pickAction: (s) => (s.q && !s.answer ? { type: "answer", optionId: s.q.answerId } : null),
      stopAfter: 0,
    });
    const s = runner.getSnapshot().state;
    const q = s.q!;
    const [baseId] = q.id.split(">");
    const fromBase = q.options.filter((o) => o.id.startsWith(`${baseId}#`) && o.id !== q.answerId);
    assert.equal(fromBase.length, q.options.length - 1);
    assert.ok(q.options.some((o) => o.id === q.answerId));
    assert.equal(new Set(q.options.map((o) => normLabel(o.label))).size, q.options.length);
  });

  it("emoji variation hides labels but keeps accessible names", () => {
    const { runner } = playHeadless({
      engine: oddOneOutEngine,
      definition: definition({ engine: "odd_one_out", variation: "emoji" }),
      content: packBundle("word_group"),
      pickAction: () => null,
      stopAfter: 0,
    });
    const q = runner.getSnapshot().state.q!;
    assert.ok(q.options.every((o) => o.label === "" && o.emoji && o.alt));
  });

  it("numbers: exactly one option breaks the rule, across all difficulty tiers", () => {
    for (const d of [0.15, 0.4, 0.5, 0.7, 0.85]) {
      for (let i = 0; i < 40; i++) {
        const q = numbersQuestion(createRng(`n-${d}-${i}`), params(d), i + 1);
        const rule = NUMBER_RULES.find((r) => q.id.endsWith(`-${r.id}`))!;
        const nums = q.options.map((o) => Number(o.label));
        assert.equal(new Set(nums).size, nums.length, q.id);
        const breakers = q.options.filter((o) => !rule.has(Number(o.label)));
        assert.deepEqual(breakers.map((o) => o.id), [q.answerId], `${q.id}: ${nums.join(",")}`);
        assert.ok(nums.every((n) => n > 0));
        assert.equal(q.options.length, 5, q.id);
      }
    }
  });

  it("numbers get harder rules at higher difficulty", () => {
    const tiers = (d: number) =>
      new Set(Array.from({ length: 30 }, (_, i) => numbersQuestion(createRng(`t${i}`), params(d), 1).id.split("-")[2]));
    const easy = tiers(0.15);
    assert.ok([...easy].every((id) => ["even", "odd", "mult5", "mult10"].includes(id)));
    assert.ok([...tiers(0.85)].some((id) => ["square", "prime", "mult7", "mult9"].includes(id)));
  });

  it("lookalike: one odd emoji; grid grows with difficulty", () => {
    const easy = lookalikeQuestion(createRng("a"), params(0.15), 1);
    const hard = lookalikeQuestion(createRng("b"), params(0.85), 1);
    assert.equal(easy.options.length, 4);
    assert.equal(hard.options.length, 16);
    for (const q of [easy, hard]) {
      const counts = new Map<string, number>();
      for (const o of q.options) counts.set(o.emoji!, (counts.get(o.emoji!) ?? 0) + 1);
      assert.equal(counts.size, 2);
      const odd = q.options.find((o) => o.id === q.answerId)!;
      assert.equal(counts.get(odd.emoji!), 1);
    }
  });
});
