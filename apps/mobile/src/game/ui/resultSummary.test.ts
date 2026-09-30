import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { scoreRows, statRows } from "./resultSummary";

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
});
