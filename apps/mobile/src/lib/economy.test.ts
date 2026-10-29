import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hintCoinCost } from "./economy";

describe("hintCoinCost", () => {
  it("prices a clue below a 50/50 and a reveal", () => {
    assert.equal(hintCoinCost("guess", "clue"), 15);
    assert.equal(hintCoinCost("odd_one_out", "fifty"), 25);
    assert.equal(hintCoinCost("word_search", "reveal"), 25);
    assert.equal(hintCoinCost("word-search", "reveal"), 25);
    assert.equal(hintCoinCost("spot_difference", "reveal"), 40);
    assert.equal(hintCoinCost("connect_dots", "reveal"), 40);
    assert.equal(hintCoinCost("maze", "path"), 40);
  });

  it("leaves hints that are not sold as null", () => {
    assert.equal(hintCoinCost("tap", "nope"), null);
  });
});
