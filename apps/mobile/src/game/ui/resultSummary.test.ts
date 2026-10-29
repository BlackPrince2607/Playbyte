import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fakeBeatenCount, resultHeadline, scoreRows, statRows } from "./resultSummary";

describe("result summary", () => {
  it("lists non-zero point components in a stable order and skips totals", () => {
    const rows = scoreRows({ total: 90, streak: 10, base: 60, speed: 20, hints: -5, difficulty: 0, bonus: 12 });
    assert.deepEqual(rows, [
      { label: "Correct answers", value: 60 },
      { label: "Speed", value: 20 },
      { label: "Streaks", value: 10 },
      { label: "Hints", value: -5 },
    ]);
  });

  it("formats stats separately from points", () => {
    assert.deepEqual(statRows({ hits: 14, misses: 2, bestReactionMs: 312.4, base: 40 }), [
      { label: "Hits", value: "14" },
      { label: "Misses", value: "2" },
      { label: "Best reaction", value: "312 ms" },
    ]);
    assert.deepEqual(scoreRows(undefined), []);
    assert.deepEqual(statRows(undefined), []);
  });

  it("picks a headline from the percentile, falling back to accuracy", () => {
    assert.deepEqual(resultHeadline({ percentile: 95 }), { title: "Legendary run!", celebrate: true });
    assert.deepEqual(resultHeadline({ percentile: 20 }), { title: "Nice try.", celebrate: false });
    assert.deepEqual(resultHeadline({ percentile: 20, correct: 5, attempts: 5 }), { title: "Flawless!", celebrate: true });
    assert.deepEqual(resultHeadline({ percentile: null, correct: 3, attempts: 4 }), { title: "Strong run!", celebrate: true });
    assert.deepEqual(resultHeadline({ percentile: null }), { title: "Run complete.", celebrate: false });
  });

  it("invents a stable fake player count from percentile and score", () => {
    const a = fakeBeatenCount(80, 120);
    const b = fakeBeatenCount(80, 120);
    assert.equal(a.pct, 80);
    assert.equal(a.count, b.count);
    assert.ok(a.count >= 12);
    const missing = fakeBeatenCount(null, 120);
    assert.ok(missing.pct >= 22 && missing.pct <= 92);
    assert.ok(missing.count >= 12);
  });
});
