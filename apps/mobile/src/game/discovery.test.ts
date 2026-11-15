import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isPlayable, nextGame } from "./discovery";

const g = (key: string) => ({ key });

describe("isPlayable", () => {
  const card = (key: string, extra: object = {}) => ({ key, title: key, blurb: "", ...extra });

  it("keeps cards this build can play and hides the rest before next-game selection", () => {
    const feed = [
      card("guess_flag", { engine: "guess", variation: "flag" }),
      card("lane_dash_legacy"),
      card("lane_dash", { engine: "lane_dash", variation: "classic" }),
      card("find_pair", { engine: "memory", variation: "pairs" }),
      card("emoji_song", { engine: "emoji_guess", variation: "song" }),
      card("future_game", { engine: "rhythm", variation: "beats" }),
      card("flag_rush"),
      card("broken", { engine: "guess" }),
      card("maze_exit", { engine: "maze", variation: "exit" }),
      card("guess_movie_pending", { engine: "guess", variation: "movie" }),
    ];
    const playable = feed.filter(isPlayable);
    assert.deepEqual(playable.map((c) => c.key), [
      "guess_flag",
      "lane_dash",
      "find_pair",
      "emoji_song",
      "flag_rush",
    ]);
    assert.equal(nextGame(playable, "guess_flag")?.key, "lane_dash");
    assert.equal(nextGame(playable, "flag_rush")?.key, "guess_flag");
  });
});

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
