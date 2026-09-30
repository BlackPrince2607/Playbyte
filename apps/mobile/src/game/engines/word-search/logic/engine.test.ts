import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRng } from "../../../core/rng";
import { definition, packBundle, playHeadless, runConformance } from "../../../testing/harness";
import { wordSearchMeta } from "../meta";
import { CLEAR_BONUS } from "./engine";
import { DIRECTIONS, cellsOf, countOccurrences, endOf, generateGrid, lineCells, normWord } from "./grid";
import type { WordSearchAction, WordSearchState } from "./types";
import { wordSearchEngine } from "./wordSearch";

/** Finds unfound words most of the time, sometimes drags a wrong line. */
const player = (s: WordSearchState, rng: { chance(p: number): boolean; pick<T>(x: readonly T[]): T }): WordSearchAction | null => {
  if (s.roundOver) return null;
  const done = new Set(s.found.map((f) => f.word));
  const left = s.words.filter((w) => !done.has(w.word));
  if (!left.length) return null;
  if (rng.chance(0.2)) return { type: "select", from: [0, 0], to: [0, 2] };
  const w = rng.pick(left);
  return rng.chance(0.5) ? { type: "select", from: w.start, to: endOf(w) } : { type: "select", from: endOf(w), to: w.start };
};

const content = packBundle("word_group");

for (const v of wordSearchMeta.variations) {
  runConformance({
    name: `word_search/${v.id}`,
    engine: wordSearchEngine,
    definition: definition({ engine: "word_search", variation: v.id }),
    content,
    pickAction: player,
    stepMs: 1500,
    invalidAction: () => ({ type: "select", from: [0, 0], to: [1, 2] }),
    finite: true,
  });
}

describe("WordGridGenerator", () => {
  it("places words once each, inside the grid, using only unlocked directions", () => {
    const words = ["APPLE", "MANGO", "GRAPES", "CHERRY", "PEAR", "BANANA", "LEMON"];
    for (let i = 0; i < 40; i++) {
      for (const dirCount of [2, 4, 8]) {
        const { grid, placed } = generateGrid(createRng(`g${i}-${dirCount}`), words, 8, dirCount);
        assert.equal(grid.length, 8);
        assert.ok(grid.every((row) => row.length === 8 && /^[A-Z]+$/.test(row)));
        assert.ok(placed.length >= 5, `placed ${placed.length}`);
        const allowed = DIRECTIONS.slice(0, dirCount).map((d) => d.join(","));
        for (const p of placed) {
          assert.ok(allowed.includes(p.dir.join(",")));
          assert.equal(cellsOf(p).map(([r, c]) => grid[r][c]).join(""), p.word);
          assert.equal(countOccurrences(grid, p.word), 1, `${p.word} in\n${grid.join("\n")}`);
        }
      }
    }
  });

  it("drops words hidden inside longer ones", () => {
    const { placed } = generateGrid(createRng("sub"), ["PEN", "PENCIL", "NEP", "RULER"], 8, 8);
    const ws = placed.map((p) => p.word);
    assert.ok(ws.includes("PENCIL") && !ws.includes("PEN") && !ws.includes("NEP"));
  });

  it("respects the word limit", () => {
    const { placed } = generateGrid(createRng("lim"), ["APPLE", "MANGO", "GRAPES", "CHERRY", "PEAR"], 8, 4, 3);
    assert.equal(placed.length, 3);
  });

  it("straight-line selection helper", () => {
    assert.deepEqual(lineCells([0, 0], [0, 2]), [[0, 0], [0, 1], [0, 2]]);
    assert.deepEqual(lineCells([2, 2], [0, 0]), [[2, 2], [1, 1], [0, 0]]);
    assert.equal(lineCells([0, 0], [1, 2]), null);
    assert.equal(normWord("Gulab Jamun"), "GULABJAMUN");
  });
});

describe("word search rules", () => {
  const start = (variation = "classic", extra: Record<string, unknown> = {}) =>
    playHeadless({ engine: wordSearchEngine, definition: definition({ engine: "word_search", variation, ...extra }), content, pickAction: () => null, stopAfter: 0 });

  it("finding a word forwards or backwards scores it once", () => {
    const { runner } = start();
    const s = runner.getSnapshot().state;
    const [w] = s.words;
    assert.equal(runner.dispatch({ type: "select", from: endOf(w), to: w.start }).accepted, true);
    const after = runner.getSnapshot().state;
    assert.equal(after.found.length, 1);
    assert.ok(after.score > 0);
    runner.dispatch({ type: "select", from: w.start, to: endOf(w) });
    assert.equal(runner.getSnapshot().state.found.length, 1);
  });

  it("wrong lines break the streak without costing points", () => {
    const { runner } = start();
    const s = runner.getSnapshot().state;
    runner.dispatch({ type: "select", from: s.words[0].start, to: endOf(s.words[0]) });
    const before = runner.getSnapshot().state.score;
    const cells = new Set(s.words.flatMap((p) => cellsOf(p).map((c) => c.join(","))));
    // Find a 2-letter line that is not a word.
    let bad: WordSearchAction | null = null;
    for (let r = 0; r < s.grid.length && !bad; r++) if (!cells.has(`${r},0`)) bad = { type: "select", from: [r, 0], to: [r, 1] };
    runner.dispatch(bad ?? { type: "select", from: [0, 0], to: [0, 1] });
    const after = runner.getSnapshot().state;
    assert.equal(after.streak, 0);
    assert.equal(after.score, before);
  });

  it("clearing a grid early earns a time bonus; timing out does not", () => {
    const { runner } = start("classic", { roundCount: 2 });
    for (const w of runner.getSnapshot().state.words) runner.dispatch({ type: "select", from: w.start, to: endOf(w) });
    const s = runner.getSnapshot();
    assert.equal(s.status, "roundOver");
    assert.ok(s.state.breakdown.clear > 0 && s.state.breakdown.clear <= CLEAR_BONUS);

    const t = start("classic", { roundCount: 2 });
    t.clock.advance(t.runner.getSnapshot().state.roundLimitMs + 10);
    t.runner.tick();
    assert.equal(t.runner.getSnapshot().status, "roundOver");
    assert.equal(t.runner.getSnapshot().state.breakdown.clear, undefined);
  });

  it("the reveal hint marks a word and costs points on that word", () => {
    const { runner } = start();
    runner.useHint("reveal");
    const s = runner.getSnapshot().state;
    assert.equal(s.hinted.length, 1);
    const w = s.words.find((p) => p.word === s.hinted[0])!;
    runner.dispatch({ type: "select", from: w.start, to: endOf(w) });
    assert.ok(runner.getSnapshot().state.breakdown.hints < 0);
  });

  it("mystery mode hides the word list", () => {
    assert.equal(start("mystery").runner.getSnapshot().state.hidden, true);
    assert.equal(start("classic").runner.getSnapshot().state.hidden, false);
  });

  it("harder levels mean bigger grids and more words", () => {
    const at = (lvl: number) =>
      start("classic", { difficulty: { start: lvl, controller: "fixed" } }).runner.getSnapshot().state;
    const easy = at(0);
    const hard = at(1);
    assert.ok(hard.grid.length > easy.grid.length);
    assert.ok(hard.words.length > easy.words.length);
  });
});
