import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayCopy, hasDevanagari } from "./displayLang";

describe("displayCopy", () => {
  it("keeps English and strips Devanagari in English mode", () => {
    assert.equal(displayCopy("How often do you check news? कितनी बार?", "en"), "How often do you check news?");
    assert.equal(displayCopy("India / भारत", "en"), "India");
  });

  it("keeps Hindi and drops Latin halves in Hindi mode", () => {
    assert.equal(displayCopy("एक्साइटेड!", "hi"), "एक्साइटेड!");
    assert.equal(displayCopy("Excited! / एक्साइटेड!", "hi"), "एक्साइटेड!");
  });

  it("never falls back to the other language", () => {
    // English UI must not show pure Hindi.
    assert.equal(displayCopy("आप क्या खाते हैं?", "en"), "");
    assert.equal(displayCopy("चाय!", "en"), "");
    // Hindi UI must not show pure Latin English.
    assert.equal(displayCopy("Once a day.", "hi"), "");
  });

  it("strips Arabic/Urdu script from mixed options", () => {
    assert.equal(displayCopy("रियल مدريد", "hi"), "रियल");
    assert.equal(displayCopy("Real مدريد", "en"), "Real");
  });

  it("detects Devanagari", () => {
    assert.equal(hasDevanagari("hello"), false);
    assert.equal(hasDevanagari("नमस्ते"), true);
  });
});
