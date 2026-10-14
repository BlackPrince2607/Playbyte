import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { codeFromUrl, formatFriendCode, friendCodeFor, inviteLink, parseFriendCode } from "./friendCode";

// Shared with backend/tests/test_friend_codes.py so both sides agree.
const ID = "3f2a9c1b-0d4e-4b7a-9c2d-81e5f6a7b8c9";
const CODE = "7WN9R6RD";

describe("friend codes", () => {
  it("derives the same code as the backend", () => {
    assert.equal(friendCodeFor(ID), CODE);
    assert.equal(friendCodeFor("00000000-0000-0000-0000-000000000000"), "00000000");
    assert.equal(friendCodeFor("ffffffff-ffff-ffff-ffff-ffffffffffff"), "ZZZZZZZZ");
    assert.equal(formatFriendCode(CODE), "7WN9-R6RD");
  });

  it("reads typed codes in any case, with or without the dash", () => {
    for (const text of ["7WN9R6RD", "7wn9-r6rd", " 7WN9 R6RD "]) assert.equal(parseFriendCode(text), CODE);
    assert.equal(parseFriendCode("o0il-abcd"), "0011ABCD");
  });

  it("reads invite links, shared messages and old player IDs", () => {
    assert.equal(parseFriendCode("Add me: https://maja.example/add/7WN9-R6RD"), CODE);
    assert.equal(parseFriendCode(`My player ID: ${ID}`), CODE);
  });

  it("rejects anything else", () => {
    for (const text of ["", "7WN9R6R", "7WN9-R6RU", "hello there"]) assert.equal(parseFriendCode(text), null);
  });

  it("finds the code in opened links", () => {
    assert.equal(codeFromUrl("https://maja.example/add/7WN9-R6RD"), CODE);
    assert.equal(codeFromUrl("maja://add/7wn9r6rd?x=1"), CODE);
    assert.equal(codeFromUrl("maja://feed"), null);
    assert.equal(codeFromUrl(null), null);
  });

  it("builds invite links from the server address", () => {
    assert.equal(inviteLink(CODE, "https://maja.example/"), "https://maja.example/add/7WN9-R6RD");
    assert.equal(inviteLink(CODE, undefined), null);
  });
});
