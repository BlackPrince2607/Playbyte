/**
 * End-to-end: English and Hindi content pools stay separate for quiz games.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FALLBACK_PACKS, FALLBACK_PACKS_HI } from "../game/content/packs";
import { validatePack } from "../game/content/validate";
import { createRng } from "../game/core/rng";
import { defaultBuild, defaultToPool } from "../game/engines/quiz/logic/engine";
import { setContentLocale, getContentLocale } from "./contentLocale";

const DEVANAGARI = /[\u0900-\u097F]/;
const ARABIC = /[\u0600-\u06FF]/;
const LATIN = /[A-Za-z]/;

describe("locale separation e2e", () => {
  it("maps settings language to pack locale", () => {
    setContentLocale("en");
    assert.equal(getContentLocale(), "en-IN");
    setContentLocale("hi");
    assert.equal(getContentLocale(), "hi-IN");
    setContentLocale("en");
    assert.equal(getContentLocale(), "en-IN");
  });

  it("builds Flag Guess questions in Devanagari for hi-IN and Latin for en-IN", async () => {
    const hi = validatePack(await FALLBACK_PACKS_HI.flag()).items.map(defaultToPool).filter(Boolean);
    const en = validatePack(await FALLBACK_PACKS.flag()).items.map(defaultToPool).filter(Boolean);
    assert.ok(hi.length >= 6);
    assert.ok(en.length >= 6);

    const hiQ = defaultBuild("Which country's flag is this?")({
      item: hi[0]!,
      pool: hi as NonNullable<(typeof hi)[0]>[],
      params: { optionCount: 4, similarity: 0.5, targetDifficulty: 0.2, timeLimitMs: 10_000, startClues: 1 },
      rng: createRng("hi-flag-e2e"),
      round: 1,
    });
    assert.ok(hiQ);
    for (const o of hiQ!.options) {
      assert.ok(DEVANAGARI.test(o.label), `hi option ${o.label}`);
      assert.ok(!ARABIC.test(o.label));
    }

    const enQ = defaultBuild("Which country's flag is this?")({
      item: en[0]!,
      pool: en as NonNullable<(typeof en)[0]>[],
      params: { optionCount: 4, similarity: 0.5, targetDifficulty: 0.2, timeLimitMs: 10_000, startClues: 1 },
      rng: createRng("en-flag-e2e"),
      round: 1,
    });
    assert.ok(enQ);
    for (const o of enQ!.options) {
      assert.ok(LATIN.test(o.label), `en option ${o.label}`);
      assert.ok(!DEVANAGARI.test(o.label));
      assert.ok(!ARABIC.test(o.label));
    }
  });

  it("keeps Hindi odd-one-out job words in Devanagari (no Teacher)", async () => {
    const items = validatePack(await FALLBACK_PACKS_HI.word_group()).items;
    const jobs = items.find((i) => i.id === "wg.jobs.hi");
    assert.ok(jobs);
    const members = jobs!.attributes.members as string[];
    assert.ok(members.includes("शिक्षक"));
    assert.ok(!members.includes("Teacher"));
    assert.ok(members.every((m) => DEVANAGARI.test(m)));
  });
});
