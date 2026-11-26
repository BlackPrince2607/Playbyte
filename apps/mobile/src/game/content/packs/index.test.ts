import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validatePack } from "../validate";
import { FALLBACK_PACKS, FALLBACK_PACKS_HI } from "./index";

const DEVANAGARI = /[\u0900-\u097F]/;
const ARABIC = /[\u0600-\u06FF]/;

describe("fallback packs", () => {
  it("ships a Hindi-native pack for every English fallback pack", () => {
    const en = Object.keys(FALLBACK_PACKS).sort();
    const hi = Object.keys(FALLBACK_PACKS_HI).sort();
    assert.deepEqual(hi, en);
  });

  it("keeps Hindi word_group member labels in Devanagari (with latinMembers for word search)", async () => {
    const items = (await FALLBACK_PACKS_HI.word_group()) as Array<{
      attributes?: { members?: unknown; latinMembers?: unknown };
    }>;
    assert.ok(Array.isArray(items) && items.length > 0);
    for (const item of items) {
      const members = item.attributes?.members;
      assert.ok(Array.isArray(members) && members.length >= 4);
      for (const m of members) {
        assert.equal(typeof m, "string");
        assert.ok(DEVANAGARI.test(m as string), `expected Devanagari member, got ${m}`);
        assert.ok(!ARABIC.test(m as string));
      }
      const latin = item.attributes?.latinMembers;
      assert.ok(Array.isArray(latin) && latin.length === members.length);
    }
  });

  it("validates every HI pack with Devanagari player copy and every EN pack without it", async () => {
    for (const [name, load] of Object.entries(FALLBACK_PACKS_HI)) {
      const v = validatePack(await load());
      assert.ok(v.items.length > 0, `hi ${name} empty`);
      assert.equal(v.rejected.length, 0, `hi ${name} rejected ${JSON.stringify(v.rejected.slice(0, 3))}`);
      for (const item of v.items) {
        assert.ok(item.locale.toLowerCase().startsWith("hi"), `${item.id} locale`);
        if (item.answer) assert.ok(DEVANAGARI.test(item.answer), `${item.id} answer`);
      }
    }
    for (const [name, load] of Object.entries(FALLBACK_PACKS)) {
      const v = validatePack(await load());
      assert.ok(v.items.length > 0, `en ${name} empty`);
      assert.equal(v.rejected.length, 0, `en ${name} rejected ${JSON.stringify(v.rejected.slice(0, 3))}`);
      for (const item of v.items) {
        if (item.answer) {
          assert.ok(!DEVANAGARI.test(item.answer), `${item.id} answer has Devanagari`);
          assert.ok(!ARABIC.test(item.answer), `${item.id} answer has Arabic`);
        }
      }
    }
  });
});
