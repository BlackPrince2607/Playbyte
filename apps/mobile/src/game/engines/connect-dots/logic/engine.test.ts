import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRng } from "../../../core/rng";
import { definition, playHeadless, runConformance } from "../../../testing/harness";
import { connectDotsMeta } from "../meta";
import { adjacent, generateBoard, hamiltonianPath } from "./board";
import { connectDotsEngine } from "./connectDots";
import { ConnectAction, ConnectState, PERFECT_BONUS, filledCells, isConnected } from "./engine";

/** Draws the generator's solution one pair at a time (sometimes a wrong partial stroke first). */
const solver = (s: ConnectState, rng: { chance(p: number): boolean }): ConnectAction | null => {
  if (s.roundOver) return null;
  const k = s.pairs.findIndex((_, i) => !isConnected(s, i));
  if (k < 0) return null;
  if (rng.chance(0.2)) return { type: "draw", color: k, cells: s.solution[k].slice(0, 2), stroke: true };
  return { type: "draw", color: k, cells: s.solution[k], stroke: true };
};

for (const v of connectDotsMeta.variations) {
  runConformance({
    name: `connect_dots/${v.id}`,
    engine: connectDotsEngine,
    definition: definition({ engine: "connect_dots", variation: v.id }),
    pickAction: solver,
    stepMs: 800,
    invalidAction: (s) => ({ type: "draw", color: 0, cells: [s.pairs[0][0], s.pairs[1][0]] }),
    finite: true,
  });
}

describe("BoardGenerator", () => {
  it("backbite produces a Hamiltonian path: every cell once, each step adjacent", () => {
    for (const size of [4, 6, 9]) {
      const path = hamiltonianPath(createRng(`h${size}`), size);
      assert.equal(new Set(path).size, size * size);
      for (let i = 1; i < path.length; i++) assert.ok(adjacent(path[i - 1], path[i], size));
    }
  });

  it("boards are solvable with full coverage and pairs are well spread", () => {
    for (const size of [5, 7, 9]) {
      for (let i = 0; i < 10; i++) {
        const b = generateBoard(createRng(`b${size}-${i}`), size, Math.round(size * 0.9));
        const covered = b.solution.flat();
        assert.equal(new Set(covered).size, size * size);
        assert.ok(b.solution.every((seg) => seg.length >= 3));
        b.solution.forEach((seg, k) => assert.deepEqual([seg[0], seg[seg.length - 1]], b.pairs[k]));
      }
    }
  });

  it("is deterministic per seed", () => {
    assert.deepEqual(generateBoard(createRng("same"), 6, 5), generateBoard(createRng("same"), 6, 5));
  });
});

describe("connect rules", () => {
  const start = (extra: Record<string, unknown> = {}) =>
    playHeadless({ engine: connectDotsEngine, definition: definition({ engine: "connect_dots", variation: "classic", ...extra }), pickAction: () => null, stopAfter: 0 }).runner;

  it("drawing the intended solution solves the board perfectly", () => {
    const runner = start({ roundCount: 1 });
    const s0 = runner.getSnapshot().state;
    s0.solution.forEach((seg, k) => assert.ok(runner.dispatch({ type: "draw", color: k, cells: seg, stroke: true }).accepted));
    const s = runner.getSnapshot().state;
    assert.equal(s.solved, true);
    assert.equal(s.perfect, true);
    assert.equal(s.breakdown.perfect, PERFECT_BONUS);
    assert.equal(filledCells(s), s.size * s.size);
  });

  it("rejects paths through other dots, gaps, and running past the matching dot", () => {
    const runner = start();
    const s = runner.getSnapshot().state;
    const [a] = s.pairs[0];
    const other = s.pairs[1][0];
    assert.equal(runner.dispatch({ type: "draw", color: 0, cells: [other] }).accepted, false);
    const far = (a + 2 * s.size) % (s.size * s.size);
    assert.equal(runner.dispatch({ type: "draw", color: 0, cells: [a, far] }).accepted, false);
    const seg = s.solution[0];
    const end = seg[seg.length - 1];
    const beyond = [1, -1, s.size, -s.size].map((d) => end + d).find((c) => c >= 0 && c < s.size * s.size && adjacent(end, c, s.size) && s.dots[c] < 0 && !seg.includes(c));
    if (beyond !== undefined) assert.equal(runner.dispatch({ type: "draw", color: 0, cells: [...seg, beyond] }).accepted, false);
  });

  it("crossing another colour's line cuts it back", () => {
    const runner = start();
    const s0 = runner.getSnapshot().state;
    runner.dispatch({ type: "draw", color: 1, cells: s0.solution[1], stroke: true });
    const s1 = runner.getSnapshot().state;
    const shared = s1.paths[1].find((c, i) => i > 0 && i < s1.paths[1].length - 1 && adjacent(c, s1.solution[0][0], s1.size));
    if (shared !== undefined) {
      assert.ok(runner.dispatch({ type: "draw", color: 0, cells: [s1.solution[0][0], shared], stroke: true }).accepted);
      const s = runner.getSnapshot().state;
      assert.ok(!s.paths[1].includes(shared));
      assert.ok(s.paths[1].length < s1.paths[1].length);
    }
  });

  it("moves count strokes; the reveal hint solves one pair and costs points", () => {
    const runner = start({ roundCount: 1 });
    runner.useHint("reveal");
    const s = runner.getSnapshot().state;
    assert.equal(s.roundHints, 1);
    assert.equal(s.pairs.filter((_, k) => isConnected(s, k)).length, 1);
    const s0 = runner.getSnapshot().state;
    s0.solution.forEach((seg, k) => {
      if (!isConnected(runner.getSnapshot().state, k)) runner.dispatch({ type: "draw", color: k, cells: seg, stroke: true });
    });
    const done = runner.getSnapshot().state;
    assert.equal(done.solved, true);
    assert.equal(done.moves, done.pairs.length - 1);
    assert.equal(done.breakdown.hints, -10);
  });

  it("time out ends the board unsolved", () => {
    const { runner, clock } = playHeadless({ engine: connectDotsEngine, definition: definition({ engine: "connect_dots", variation: "blitz" }), pickAction: () => null, stopAfter: 0 });
    clock.advance(runner.getSnapshot().state.roundLimitMs + 1);
    runner.tick();
    const s = runner.getSnapshot().state;
    assert.equal(s.roundOver, true);
    assert.equal(s.solved, false);
    assert.equal(s.score, 0);
  });
});
