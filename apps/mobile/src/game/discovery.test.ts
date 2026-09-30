import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nextGame } from "./discovery";

const g = (key: string) => ({ key });

describe("nextGame", () => {
  it("returns the following game in feed order", () => {
    assert.equal(nextGame([g("a"), g("b"), g("c")], "a")?.key, "b");
    assert.equal(nextGame([g("a"), g("b"), g("c")], "b")?.key, "c");
  });

  it("wraps around at the end of the feed", () => {
    assert.equal(nextGame([g("a"), g("b"), g("c")], "c")?.key, "a");
  });

  it("skips repeated cards of the same game", () => {
    assert.equal(nextGame([g("a"), g("a"), g("b")], "a")?.key, "b");
  });

  it("falls back to the first game when the played one left the feed", () => {
    assert.equal(nextGame([g("a"), g("b")], "gone")?.key, "a");
  });

  it("returns null when there is no other game", () => {
    assert.equal(nextGame([g("a")], "a"), null);
    assert.equal(nextGame([], "a"), null);
  });
});
