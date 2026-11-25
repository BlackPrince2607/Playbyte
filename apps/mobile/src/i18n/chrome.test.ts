import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { localizeChrome } from "./chrome";

describe("localizeChrome", () => {
  it("keeps English engine prompts in en", () => {
    assert.equal(localizeChrome("Which country's flag is this?", "en"), "Which country's flag is this?");
  });

  it("localizes engine prompts for Hindi UI chrome", () => {
    assert.equal(localizeChrome("Which country's flag is this?", "hi"), "ये किस देश का झंडा है?");
    assert.equal(localizeChrome("Next clue", "hi"), "अगला क्लू");
    assert.equal(localizeChrome("Time's up!", "hi"), "टाइम खत्म!");
  });
});
