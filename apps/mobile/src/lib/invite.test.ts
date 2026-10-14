import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inviteMessage } from "./invite";

describe("inviteMessage", () => {
  it("is just the pitch when there is no link or code", () => {
    assert.equal(inviteMessage(), "Come play with me on MAJA — every swipe is a game.");
  });

  it("adds the download link on its own line", () => {
    const msg = inviteMessage({ link: " https://play.example/app " });
    assert.deepEqual(msg.split("\n").slice(1), ["https://play.example/app"]);
  });

  it("prefers the personal invite link and adds the friend code", () => {
    const msg = inviteMessage({
      link: "https://play.example/app",
      friendLink: "https://maja.example/add/7WN9-R6RD",
      friendCode: "7WN9-R6RD",
    });
    assert.deepEqual(msg.split("\n").slice(1), ["https://maja.example/add/7WN9-R6RD", "My friend code: 7WN9-R6RD"]);
  });
});
