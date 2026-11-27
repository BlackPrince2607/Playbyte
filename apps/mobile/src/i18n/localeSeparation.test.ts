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

  it("never mixes Queen / क्वीन in one emoji_movie question pool", async () => {
    const en = validatePack(await FALLBACK_PACKS.emoji_movie()).items.map(defaultToPool).filter(Boolean);
    const hi = validatePack(await FALLBACK_PACKS_HI.emoji_movie()).items.map(defaultToPool).filter(Boolean);
    const enQueen = en.find((p) => p!.id === "em.queen");
    const hiQueen = hi.find((p) => p!.id === "em.queen.hi");
    assert.ok(enQueen);
    assert.ok(hiQueen);
    assert.equal(enQueen!.answer, "Queen");
    assert.ok(DEVANAGARI.test(hiQueen!.answer));

    const enQ = defaultBuild("Which movie is this?")({
      item: enQueen!,
      pool: en as NonNullable<(typeof en)[0]>[],
      params: { optionCount: 4, similarity: 0.8, targetDifficulty: 0.45, timeLimitMs: 10_000, startClues: 1 },
      rng: createRng("en-queen-e2e"),
      round: 1,
    });
    assert.ok(enQ);
    const labels = enQ!.options.map((o) => o.label);
    assert.ok(labels.includes("Queen"));
    assert.ok(labels.every((l) => !DEVANAGARI.test(l)), `EN options mixed Hindi: ${labels.join(", ")}`);

    const hiQ = defaultBuild("यह कौन सी फिल्म है?")({
      item: hiQueen!,
      pool: hi as NonNullable<(typeof hi)[0]>[],
      params: { optionCount: 4, similarity: 0.8, targetDifficulty: 0.45, timeLimitMs: 10_000, startClues: 1 },
      rng: createRng("hi-queen-e2e"),
      round: 1,
    });
    assert.ok(hiQ);
    for (const o of hiQ!.options) {
      assert.ok(DEVANAGARI.test(o.label), `hi option ${o.label}`);
    }
  });

  it("keeps Guess the State clues/options in one language package", async () => {
    const enItems = validatePack(await FALLBACK_PACKS.indian_state()).items;
    const hiItems = validatePack(await FALLBACK_PACKS_HI.indian_state()).items;
    for (const item of enItems) {
      for (const h of item.hints ?? []) assert.ok(!DEVANAGARI.test(h), `${item.id} hint`);
      if (item.answer) assert.ok(!DEVANAGARI.test(item.answer), `${item.id} answer`);
    }
    for (const item of hiItems) {
      for (const h of item.hints ?? []) assert.ok(DEVANAGARI.test(h), `${item.id} hint`);
      if (item.answer) assert.ok(DEVANAGARI.test(item.answer), `${item.id} answer`);
    }

    const enPool = enItems.map(defaultToPool).filter(Boolean);
    const hiPool = hiItems.map(defaultToPool).filter(Boolean);
    const enQ = defaultBuild("Which state is this?")({
      item: enPool[0]!,
      pool: enPool as NonNullable<(typeof enPool)[0]>[],
      params: { optionCount: 4, similarity: 0.5, targetDifficulty: 0.3, timeLimitMs: 10_000, startClues: 2 },
      rng: createRng("en-state-e2e"),
      round: 1,
    });
    const hiQ = defaultBuild("यह कौन सा राज्य है?")({
      item: hiPool[0]!,
      pool: hiPool as NonNullable<(typeof hiPool)[0]>[],
      params: { optionCount: 4, similarity: 0.5, targetDifficulty: 0.3, timeLimitMs: 10_000, startClues: 2 },
      rng: createRng("hi-state-e2e"),
      round: 1,
    });
    assert.ok(enQ && hiQ);
    for (const o of enQ!.options) assert.ok(!DEVANAGARI.test(o.label));
    for (const c of enQ!.clues) if (c.kind === "text") assert.ok(!DEVANAGARI.test(c.value));
    for (const o of hiQ!.options) assert.ok(DEVANAGARI.test(o.label));
    for (const c of hiQ!.clues) if (c.kind === "text") assert.ok(DEVANAGARI.test(c.value));
  });
});
