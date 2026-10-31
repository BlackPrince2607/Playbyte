import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRng } from "../../../core/rng";
import { definition, playHeadless, runConformance } from "../../../testing/harness";
import { arrowMeta } from "../meta";
import { arrowEngine } from "./arrowPuzzle";
import { Cell, arrowCount, generateBoard, isFree, solvable } from "./board";
import { ArrowAction, ArrowState, BLOCK_MS, BOARD_BONUS } from "./engine";

const solver = (s: ArrowState): ArrowAction | null => {
  if (s.roundOver || !s.cells.length) return null;
  const index = s.cells.findIndex((_, i) => isFree(s.cells, s.cols, s.rows, i));
  return index < 0 ? null : { type: "tap", index };
};

for (const v of arrowMeta.variations) {
  runConformance({
    name: `arrow_puzzle/${v.id}`,
    engine: arrowEngine,
    definition: definition({ engine: "arrow_puzzle", variation: v.id }),
    pickAction: solver,
    stepMs: 250,
    invalidAction: () => ({ type: "tap", index: -1 }),
    // Per-board clock reset: a perfect solver never times out.
    finite: false,
  });
}

const opened = (variation: string, seed = "rules") =>
  playHeadless({
    engine: arrowEngine,
    definition: definition({ engine: "arrow_puzzle", variation }),
    pickAction: () => null,
    stopAfter: 0,
    seed,
  }).runner.getSnapshot().state;

describe("arrow boards", () => {
  it("builds a solvable board with an exit and a stable seed", () => {
    for (let i = 0; i < 25; i++) {
      const cells = generateBoard(createRng(`board-${i}`), 5, 5, 0.7);
      assert.equal(solvable(cells, 5, 5), true);
      assert.ok(arrowCount(cells) >= 8);
      assert.ok(cells.some((_, idx) => isFree(cells, 5, 5, idx)));
    }
    assert.deepEqual(generateBoard(createRng("same"), 6, 6, 0.78), generateBoard(createRng("same"), 6, 6, 0.78));
  });
});

describe("arrow rules", () => {
  it("gives each board 10 or 12 seconds", () => {
    assert.equal(opened("s20").roundLimitMs, 10_000);
    assert.equal(opened("s25").roundLimitMs, 12_000);
    assert.equal(arrowEngine.maxScore(definition({ engine: "arrow_puzzle", variation: "s20" })), 45012);
    assert.equal(arrowEngine.maxScore(definition({ engine: "arrow_puzzle", variation: "s25" })), 54000);
  });

  it("sends a clear arrow and frees whatever was behind it", () => {
    const base = opened("s20");
    const board: ArrowState = { ...base, cols: 3, rows: 1, cells: [1, 1, null] };
    const blocked = arrowEngine.reduce(board, { type: "tap", index: 0 }, { now: 100, rng: createRng("no") });
    assert.equal(blocked.state.cells[0], 1);
    assert.equal(blocked.state.score, board.score);
    assert.equal(blocked.state.roundEnd, board.roundEnd - BLOCK_MS);
    assert.equal(blocked.outcome?.correct, false);

    const sent = arrowEngine.reduce(board, { type: "tap", index: 1 }, { now: 100, rng: createRng("yes") });
    assert.equal(sent.state.cells[1], null);
    assert.equal(sent.state.roundEnd, board.roundEnd);
    assert.ok(sent.state.score > board.score);
    assert.equal(isFree(sent.state.cells, 3, 1, 0), true);
  });

  it("a cleared board deals a larger one, pays the bonus, and resets the clock", () => {
    const base = opened("s20");
    const board: ArrowState = {
      ...base,
      cols: 2,
      rows: 2,
      cells: [1, null, null, null] as Cell[],
      fill: 0.62,
      roundEnd: base.roundStart + 2_000,
      roundLimitMs: base.limitMs,
    };
    const at = board.roundStart + 1_500;
    const cleared = arrowEngine.reduce(board, { type: "tap", index: 0 }, { now: at, rng: createRng("next") });
    assert.equal(cleared.state.boards, 1);
    assert.equal(cleared.state.cleared, base.cleared + 1);
    assert.equal(cleared.state.cols, 3);
    assert.equal(cleared.state.rows, 3);
    assert.ok(arrowCount(cleared.state.cells) > 1);
    assert.equal(cleared.state.breakdown.clear, BOARD_BONUS);
    assert.equal(solvable(cleared.state.cells, cleared.state.cols, cleared.state.rows), true);
    assert.equal(cleared.state.roundStart, at);
    assert.equal(cleared.state.roundEnd, at + board.limitMs);
    assert.equal(cleared.state.roundLimitMs, board.limitMs);
  });

  it("opens on a square board", () => {
    const s = opened("s20");
    assert.equal(s.cols, s.rows);
    assert.ok(s.cols >= 4 && s.cols <= 6);
  });

  it("a blocked tap inside the last second ends the run", () => {
    const base = opened("s20");
    const board: ArrowState = { ...base, cols: 2, rows: 1, cells: [1, 1], roundEnd: base.roundStart + 800 };
    const ended = arrowEngine.reduce(board, { type: "tap", index: 0 }, { now: base.roundStart + 200, rng: createRng("out") });
    assert.equal(ended.state.roundOver, true);
    assert.equal(arrowEngine.status(ended.state), "gameOver");
    assert.equal(arrowEngine.progress(ended.state).deadline, undefined);
  });

  it("the clock ending the round is a loss with the arrows still on the board", () => {
    const s = opened("s25");
    const waiting = arrowEngine.tick(s, { now: s.roundEnd - 1, rng: createRng("wait") });
    assert.equal(waiting.state, s);
    const done = arrowEngine.tick(s, { now: s.roundEnd, rng: createRng("done") });
    assert.equal(done.state.roundOver, true);
    assert.equal(done.state.cleared, 0);
    assert.equal(arrowCount(done.state.cells), arrowCount(s.cells));
  });

  it("rejects taps on empty cells", () => {
    const { runner } = playHeadless({
      engine: arrowEngine,
      definition: definition({ engine: "arrow_puzzle", variation: "s20" }),
      pickAction: () => null,
      stopAfter: 0,
    });
    const s = runner.getSnapshot().state;
    const empty = s.cells.findIndex((c) => c == null);
    assert.ok(empty >= 0);
    assert.equal(runner.dispatch({ type: "tap", index: empty }).accepted, false);
  });
});
