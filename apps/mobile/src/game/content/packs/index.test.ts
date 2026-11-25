import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FALLBACK_PACKS, FALLBACK_PACKS_HI } from "./index";

describe("fallback packs", () => {
  it("ships a Hindi-native pack for every English fallback pack", () => {
    const en = Object.keys(FALLBACK_PACKS).sort();
    const hi = Object.keys(FALLBACK_PACKS_HI).sort();
    assert.deepEqual(hi, en);
  });
});
