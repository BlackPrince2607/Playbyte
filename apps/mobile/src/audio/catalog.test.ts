import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { musicForEngine, timerCue } from "./catalog";

describe("musicForEngine", () => {
  it("matches the track to the kind of game", () => {
    assert.equal(musicForEngine("word_search"), "calm");
    assert.equal(musicForEngine("tap_dont_tap"), "arcade");
    assert.equal(musicForEngine("guess"), "think");
  });

  it("falls back to the general game track", () => {
    assert.equal(musicForEngine("brand_new_engine"), "think");
    assert.equal(musicForEngine(undefined), "think");
  });
});

describe("timerCue", () => {
  it("stays quiet until the last five seconds", () => {
    assert.equal(timerCue(9, 8), null);
    assert.equal(timerCue(6, 5), "tick");
    assert.equal(timerCue(4, 3), "tickUrgent");
    assert.equal(timerCue(1, 0), "timeUp");
  });

  it("ignores a new round resetting the clock", () => {
    assert.equal(timerCue(2, 15), null);
    assert.equal(timerCue(3, 3), null);
  });
});
