import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRng } from "../core/rng";
import { memoryStore } from "../session/types";
import { createRecentIdsStore } from "../session/store";
import { samplePreferFresh, seedUsedFromRecent, usedIdsFromState } from "./recent";

describe("samplePreferFresh", () => {
  it("prefers ids not in the avoid set", () => {
    const items = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `i${n}` }));
    const out = samplePreferFresh(items, ["i1", "i2", "i3"], createRng("fresh"), 3);
    assert.equal(out.length, 3);
    assert.ok(out.every((x) => !["i1", "i2", "i3"].includes(x.id)));
  });

  it("fills from avoided items when the fresh set is too small", () => {
    const items = [1, 2, 3].map((n) => ({ id: `i${n}` }));
    const out = samplePreferFresh(items, ["i1", "i2"], createRng("fill"), 3);
    assert.equal(out.length, 3);
    assert.ok(out.some((x) => x.id === "i3"));
  });
});

describe("seedUsedFromRecent", () => {
  it("leaves enough fresh pool slots for a full session", () => {
    const pool = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const used = seedUsedFromRecent(pool, ["a", "b", "c", "d", "e", "f"], 8);
    assert.ok(used.length <= 2);
    assert.ok(used.every((id) => pool.includes(id)));
  });
});

describe("usedIdsFromState", () => {
  it("reads string ids from engine state", () => {
    assert.deepEqual(usedIdsFromState({ used: ["a", 1, "b"] }), ["a", "b"]);
    assert.deepEqual(usedIdsFromState(null), []);
  });
});

describe("recentIdsStore", () => {
  it("keeps newest ids and rotates older ones out", async () => {
    const store = createRecentIdsStore(memoryStore(), 4);
    await store.record("guess", "flag", ["a", "b"]);
    await store.record("guess", "flag", ["c", "d"]);
    await store.record("guess", "flag", ["e"]);
    assert.deepEqual(await store.get("guess", "flag"), ["b", "c", "d", "e"]);
    await store.record("guess", "flag", ["b"]);
    assert.deepEqual(await store.get("guess", "flag"), ["c", "d", "e", "b"]);
  });
});
