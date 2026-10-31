import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayCopy, hasDevanagari } from "./displayLang";

describe("displayCopy", () => {
  it("strips Devanagari in English mode", () => {
    assert.equal(displayCopy("How often do you check news? कितनी बार?", "en"), "How often do you check news?");
    assert.equal(displayCopy("India / भारत", "en"), "India");
  });

  it("keeps Hindi and drops Latin halves in Hindi mode", () => {
    assert.equal(displayCopy("एक्साइटेड!", "hi"), "एक्साइटेड!");
    assert.equal(displayCopy("Excited! / एक्साइटेड!", "hi"), "एक्साइटेड!");
  });

  it("leaves Latin-only text alone in Hindi mode as fallback", () => {
    assert.equal(displayCopy("Once a day.", "hi"), "Once a day.");
  });

  it("keeps pure Hindi in English mode instead of punctuation leftovers", () => {
    assert.equal(displayCopy("आप क्या खाते हैं?", "en"), "आप क्या खाते हैं?");
    assert.equal(displayCopy("चाय!", "en"), "चाय!");
  });

  it("detects Devanagari", () => {
    assert.equal(hasDevanagari("hello"), false);
    assert.equal(hasDevanagari("नमस्ते"), true);
  });
});
