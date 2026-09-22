/**
 * Pure game-logic edge cases (no RN runtime).
 * Run: pnpm --filter @playbyte/mobile test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pickFlagQuestions } from "./content/flags.ts";
import { pickEmojiPuzzles } from "./content/emojiPuzzles.ts";
import { FIVE_LETTER_WORDS, pickWord, scramble } from "./content/words.ts";
import {
  SEEDED_GAME_KEYS,
  buildPuzzle,
  normalizeGuess,
  scoreCircle,
  scoreGuess,
} from "./logic/scoring.ts";
import { configMode, configTag } from "./types.ts";

describe("seeded keys", () => {
  it("lists all 16 game keys", () => {
    assert.equal(SEEDED_GAME_KEYS.length, 16);
    assert.ok(new Set(SEEDED_GAME_KEYS).size === 16);
  });
});

describe("config helpers", () => {
  it("normalizes tag and mode", () => {
    assert.equal(configTag({ tag: "arcade" }), "ARCADE");
    assert.equal(configTag({ genre: "word" }), "WORD");
    assert.equal(configTag(undefined), "GAME");
    assert.equal(configMode({ mode: "endless" }), "endless");
    assert.equal(configMode({ mode: "finite" }), "finite");
    assert.equal(configMode({}), "finite");
  });
});

describe("words", () => {
  it("only uses 5-letter uppercase bank words", () => {
    for (const w of FIVE_LETTER_WORDS) {
      assert.equal(w.length, 5, w);
      assert.equal(w, w.toUpperCase());
    }
  });

  it("scramble never equals input for mixed letters", () => {
    for (let i = 0; i < 40; i++) {
      const w = pickWord();
      const s = scramble(w);
      assert.equal(s.length, w.length);
      assert.notEqual(s, w);
      assert.equal([...s].sort().join(""), [...w].sort().join(""));
    }
  });

  it("scramble is safe for identical letters", () => {
    assert.equal(scramble("AAAAA"), "AAAAA");
  });
});

describe("flags / emoji content", () => {
  it("pickFlagQuestions returns n unique with 4 options including answer", () => {
    const qs = pickFlagQuestions(10);
    assert.equal(qs.length, 10);
    const names = new Set(qs.map((q) => q.name));
    assert.equal(names.size, 10);
    for (const q of qs) {
      assert.equal(q.options.length, 4);
      assert.ok(q.options.includes(q.name));
    }
  });

  it("pickFlagQuestions caps at bank size", () => {
    assert.ok(pickFlagQuestions(100).length <= 30);
  });

  it("pickEmojiPuzzles returns requested count", () => {
    assert.equal(pickEmojiPuzzles(5).length, 5);
    assert.ok(pickEmojiPuzzles(100).length <= 20);
  });

  it("normalizeGuess collapses punctuation and case", () => {
    assert.equal(normalizeGuess("  raining-cats  and dogs!! "), "RAINING CATS AND DOGS");
  });
});

describe("word blitz scoring", () => {
  it("marks correct / present / absent with duplicate letters", () => {
    const cells = scoreGuess("APPLE", "PAPER");
    assert.equal(cells.map((c) => c.state).join(","), "present,present,correct,absent,present");
    const exact = scoreGuess("PAPER", "PAPER");
    assert.ok(exact.every((c) => c.state === "correct"));
  });
});

describe("perfect circle scoring", () => {
  it("rejects short or tiny strokes", () => {
    assert.equal(scoreCircle([{ x: 0, y: 0 }, { x: 1, y: 1 }]), 0);
    const tiny = Array.from({ length: 20 }, (_, i) => ({
      x: 10 + Math.cos(i) * 5,
      y: 10 + Math.sin(i) * 5,
    }));
    assert.equal(scoreCircle(tiny), 0);
  });

  it("scores a near-circle highly", () => {
    const pts = Array.from({ length: 48 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2;
      return { x: 100 + Math.cos(a) * 60, y: 100 + Math.sin(a) * 60 };
    });
    assert.ok(scoreCircle(pts) >= 80);
  });
});

describe("grid hunt", () => {
  it("always places requested words", () => {
    for (let i = 0; i < 20; i++) {
      const puzzle = buildPuzzle(2, FIVE_LETTER_WORDS);
      assert.equal(puzzle.placements.length, 2);
      for (const p of puzzle.placements) {
        const spelling = p.cells.map(([r, c]) => puzzle.grid[r][c]).join("");
        assert.equal(spelling, p.word);
      }
    }
  });
});
