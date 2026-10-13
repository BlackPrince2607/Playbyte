import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { FeedGame, FeedItem, FeedMoment } from "../api";
import { MOMENT_REPEAT_GAP, appendFeedPage, feedKeys } from "./feedPages";

const moment = (id: string) => ({ type: "moment", id }) as FeedMoment;
const game = (key: string) => ({ type: "mini_game", key }) as FeedGame;
const ids = (items: FeedItem[]) => items.map((i) => (i.type === "moment" ? i.id : i.key));

describe("feed pages", () => {
  it("appends new moments and games after the current page", () => {
    const next = appendFeedPage([moment("a"), game("tap")], [moment("b"), game("maze")]);
    assert.deepEqual(ids(next), ["a", "tap", "b", "maze"]);
  });

  it("skips moments that are already in the feed", () => {
    const next = appendFeedPage([moment("a"), moment("b")], [moment("b"), moment("c"), moment("a")]);
    assert.deepEqual(ids(next), ["a", "b", "c"]);
  });

  it("lets a moment come back once it has scrolled far enough away", () => {
    const filler = Array.from({ length: MOMENT_REPEAT_GAP }, (_, i) => moment(`f${i}`));
    const next = appendFeedPage([moment("a"), ...filler], [moment("a")]);
    assert.deepEqual(ids(next).slice(-1), ["a"]);
    assert.equal(next.length, MOMENT_REPEAT_GAP + 2);
  });

  it("never shows the same game twice in a row", () => {
    const next = appendFeedPage([moment("a"), game("tap")], [game("tap"), game("maze"), moment("b")]);
    assert.deepEqual(ids(next), ["a", "tap", "maze", "b"]);
  });

  it("returns the same array when nothing new arrives", () => {
    const current = [moment("a")];
    assert.equal(appendFeedPage(current, [moment("a")]), current);
  });

  it("gives repeated games unique keys that survive appending", () => {
    const first = [game("tap"), moment("a"), game("tap")];
    assert.deepEqual(feedKeys(first), ["g:tap", "m:a", "g:tap:1"]);
    const more = appendFeedPage(first, [moment("b"), game("tap")]);
    assert.deepEqual(feedKeys(more), ["g:tap", "m:a", "g:tap:1", "m:b", "g:tap:2"]);
  });
});
