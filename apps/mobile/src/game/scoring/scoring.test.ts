import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { definition } from "../testing/harness";
import {
  DEFAULT_ANSWER_SCORING,
  addBreakdown,
  answerScoring,
  applyPct,
  difficultyMultiplier,
  hintPenalty,
  maxAnswerPoints,
  mistakePenalty,
  scoreAnswer,
  speedBonus,
  streakBonus,
  timeRemainingBonus,
} from "./index";

describe("scoring primitives", () => {
  it("are integer and bounded", () => {
    assert.equal(applyPct(15, 133), 19);
    assert.equal(difficultyMultiplier(0), 100);
    assert.equal(difficultyMultiplier(0.5), 125);
    assert.equal(difficultyMultiplier(2), 150);
    assert.equal(speedBonus(0, 10_000, 5), 5);
    assert.equal(speedBonus(5_000, 10_000, 5), 2);
    assert.equal(speedBonus(5_000, 10_000, 8, "quadratic"), 2);
    assert.equal(speedBonus(12_000, 10_000, 5), 0);
    assert.equal(streakBonus(1, 1, 5), 0);
    assert.equal(streakBonus(4, 1, 5), 3);
    assert.equal(streakBonus(40, 1, 5), 5);
    assert.equal(hintPenalty(2, 3), 6);
    assert.equal(mistakePenalty(-1, 3), 0);
    assert.equal(timeRemainingBonus(7_500, 30_000, 20), 5);
  });

  it("scoreAnswer golden values", () => {
    const cfg = DEFAULT_ANSWER_SCORING;
    assert.deepEqual(scoreAnswer(cfg, { correct: true, responseMs: 2_000, limitMs: 10_000, streak: 3, level: 0.5 }), {
      base: 10,
      speed: 4,
      streak: 2,
      difficulty: 4,
      hints: -0,
      mistakes: -0,
      total: 20,
    });
    assert.equal(scoreAnswer(cfg, { correct: true, responseMs: 9_999, limitMs: 10_000, streak: 1, level: 0, hintsUsed: 5 }).total, 0);
    assert.equal(scoreAnswer(cfg, { correct: false, responseMs: 1, limitMs: 10_000, streak: 0, level: 1 }).total, 0);
    assert.equal(maxAnswerPoints(cfg), 30);
  });

  it("reads overrides from the definition and clamps them", () => {
    const cfg = answerScoring(definition({ engine: "guess", variation: "flag", scoring: { base: 20, speedMax: -5, difficultyBonusPct: 9999 } }));
    assert.equal(cfg.base, 20);
    assert.equal(cfg.speedMax, 0);
    assert.equal(cfg.difficultyBonusPct, 300);
    assert.equal(cfg.streakCap, DEFAULT_ANSWER_SCORING.streakCap);
  });

  it("accumulates breakdowns", () => {
    const acc = addBreakdown(addBreakdown({}, { base: 10, speed: 2, total: 12 }), { base: 10, speed: 1, total: 11 });
    assert.deepEqual(acc, { base: 20, speed: 3 });
  });
});
