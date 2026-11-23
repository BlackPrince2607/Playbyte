import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { feedEngineId, INLINE_FEED_ENGINES, isInlineFeedGame } from "./inlineFeed";

const card = (extra: { engine?: string; config?: Record<string, unknown> } = {}) => ({
  type: "mini_game" as const,
  key: "k",
  title: "t",
  blurb: "",
  ...extra,
});

describe("isInlineFeedGame", () => {
  it("includes quiz and board engines", () => {
    for (const engine of [
      "guess",
      "emoji_guess",
      "odd_one_out",
      "math_rush",
      "fact_fake",
      "choice",
      "memory",
      "arrow_puzzle",
      "spot_difference",
      "word_search",
      "maze",
      "connect_dots",
    ]) {
      assert.equal(isInlineFeedGame(card({ engine })), true, engine);
      assert.ok(INLINE_FEED_ENGINES.has(engine));
    }
  });

  it("excludes arcade engines", () => {
    for (const engine of ["tap", "tap_dont_tap", "lane_dash"]) {
      assert.equal(isInlineFeedGame(card({ engine })), false, engine);
    }
  });

  it("reads engine from config when top-level is missing", () => {
    assert.equal(isInlineFeedGame(card({ config: { engine: "memory" } })), true);
    assert.equal(isInlineFeedGame(card({ config: { engine: "lane_dash" } })), false);
  });

  it("returns false without an engine", () => {
    assert.equal(isInlineFeedGame(card()), false);
    assert.equal(feedEngineId(card()), undefined);
  });
});
