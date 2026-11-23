import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldOfferPostPlayHowTo } from "./howtoStorage";

describe("shouldOfferPostPlayHowTo", () => {
  it("offers teach when HowTo exists and not yet seen", () => {
    assert.equal(shouldOfferPostPlayHowTo({ hasHowTo: true, alreadySeen: false }), true);
  });

  it("skips when already seen", () => {
    assert.equal(shouldOfferPostPlayHowTo({ hasHowTo: true, alreadySeen: true }), false);
  });

  it("skips when engine has no HowTo", () => {
    assert.equal(shouldOfferPostPlayHowTo({ hasHowTo: false, alreadySeen: false }), false);
    assert.equal(shouldOfferPostPlayHowTo({ hasHowTo: false, alreadySeen: true }), false);
  });
});
