import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SEED_MAX, SEED_MIN, seededCount, withSeededCrowd } from "./seededEngagement";

const options = [
  { id: "o1", label: "Chai", sortOrder: 0 },
  { id: "o2", label: "Coffee", sortOrder: 1 },
  { id: "o3", label: "Neither", sortOrder: 2 },
];

describe("seededCount", () => {
  it("stays within range and is stable per id", () => {
    for (let i = 0; i < 500; i++) {
      const n = seededCount(`m${i}`, "likes");
      assert.ok(n >= SEED_MIN && n <= SEED_MAX, `${n} out of range`);
      assert.equal(seededCount(`m${i}`, "likes"), n);
    }
  });

  it("varies by kind", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `m${i}`);
    assert.ok(ids.some((id) => seededCount(id, "likes") !== seededCount(id, "shares")));
  });
});

describe("withSeededCrowd", () => {
  it("gives an empty moment a seeded crowd whose option counts add up", () => {
    const crowd = withSeededCrowd({ id: "m1", options, result: null });
    const sum = Object.values(crowd.optionCounts).reduce((a, b) => a + b, 0);
    assert.ok(crowd.totalResponses >= SEED_MIN && crowd.totalResponses <= SEED_MAX);
    assert.equal(sum, crowd.totalResponses);
  });

  it("adds real responses on top of the baseline", () => {
    const empty = withSeededCrowd({ id: "m1", options, result: null });
    const real = withSeededCrowd({
      id: "m1",
      options,
      result: { totalResponses: 3, optionCounts: { o2: 3 }, correctOptionId: "o2" },
    });
    assert.equal(real.totalResponses, empty.totalResponses + 3);
    assert.equal(real.optionCounts.o2, empty.optionCounts.o2 + 3);
    assert.equal(real.correctOptionId, "o2");
  });
});
