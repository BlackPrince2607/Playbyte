import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractPlayerId, playerIdShareMessage, shortPlayerId } from "./playerId";

const ID = "3f2a9c1b-0d4e-4b7a-9c2d-81e5f6a7b8c9";

describe("player IDs", () => {
  it("reads a bare ID and normalises case", () => {
    assert.equal(extractPlayerId(`  ${ID.toUpperCase()} `), ID);
  });

  it("pulls the ID out of a shared invite message", () => {
    assert.equal(extractPlayerId(playerIdShareMessage(ID)), ID);
  });

  it("rejects text without a full ID", () => {
    assert.equal(extractPlayerId("3f2a9c1b-0d4e"), null);
    assert.equal(extractPlayerId(""), null);
  });

  it("shortens IDs for display", () => {
    assert.equal(shortPlayerId(ID), "#3F2A9C1B");
  });
});
