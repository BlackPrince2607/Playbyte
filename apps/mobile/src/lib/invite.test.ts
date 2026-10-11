import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inviteMessage } from "./invite";

describe("inviteMessage", () => {
  it("is just the pitch when there is no link or player ID", () => {
    assert.equal(inviteMessage(), "Come play with me on MAJA — every swipe is a game.");
  });

  it("adds the download link and player ID on their own lines", () => {
    const msg = inviteMessage({ link: " https://play.example/app ", playerId: "abc" });
    assert.deepEqual(msg.split("\n").slice(1), ["https://play.example/app", "My player ID: abc"]);
  });
});
