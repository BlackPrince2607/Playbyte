import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRng } from "../../../core/rng";
import { definition, playHeadless, runConformance } from "../../../testing/harness";
import { arrowMeta } from "../meta";
import { arrowEngine } from "./arrowPuzzle";
import { Cell, arrowCount, generateBoard, isFree, solvable } from "./board";
import { ArrowAction, ArrowState, BLOCK_MS, CLEAR_BONUS, TIME_SCORE_CAP, finishScore, maxArrowScore } from "./engine";

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
    // One board; a perfect solver always finishes.
    finite: true,
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
  it("opens a stopwatch run with no countdown deadline", () => {
    const s = opened("s20");
    assert.equal(s.finishMs, null);
    assert.equal(s.penaltyMs, 0);
    assert.ok(s.total > 0);
    assert.equal(s.total, arrowCount(s.cells));
    assert.equal(arrowEngine.progress(s).deadline, undefined);
    assert.equal(arrowEngine.progress(s).totalRounds, 1);
    assert.equal(arrowEngine.maxScore(definition({ engine: "arrow_puzzle", variation: "s20" })), maxArrowScore());
    assert.equal(finishScore(12_345), TIME_SCORE_CAP - 12_345);
  });

  it("sends a clear arrow and frees whatever was behind it", () => {
    const base = opened("s20");
    const board: ArrowState = { ...base, cols: 3, rows: 1, cells: [1, 1, null], total: 2 };
    const blocked = arrowEngine.reduce(board, { type: "tap", index: 0 }, { now: 100, rng: createRng("no") });
    assert.equal(blocked.state.cells[0], 1);
    assert.equal(blocked.state.score, board.score);
    assert.equal(blocked.state.penaltyMs, board.penaltyMs + BLOCK_MS);
    assert.equal(blocked.state.roundOver, false);
    assert.equal(blocked.outcome?.correct, false);

    const sent = arrowEngine.reduce(board, { type: "tap", index: 1 }, { now: 100, rng: createRng("yes") });
    assert.equal(sent.state.cells[1], null);
    assert.equal(sent.state.penaltyMs, board.penaltyMs);
    assert.ok(sent.state.score > board.score);
    assert.equal(isFree(sent.state.cells, 3, 1, 0), true);
  });

  it("clearing the last arrow ends the run and records finish time", () => {
    const base = opened("s20");
    const board: ArrowState = {
      ...base,
      cols: 2,
      rows: 2,
      cells: [1, null, null, null] as Cell[],
      total: 1,
      cleared: 0,
      penaltyMs: BLOCK_MS,
      roundStart: 1_000,
    };
    const at = 4_500;
    const cleared = arrowEngine.reduce(board, { type: "tap", index: 0 }, { now: at, rng: createRng("done") });
    assert.equal(cleared.state.roundOver, true);
    assert.equal(cleared.state.cleared, 1);
    assert.equal(arrowCount(cleared.state.cells), 0);
    assert.equal(cleared.state.finishMs, at - board.roundStart + BLOCK_MS);
    assert.equal(cleared.state.breakdown.clear, CLEAR_BONUS);
    assert.equal(cleared.state.breakdown.speed, finishScore(cleared.state.finishMs!));
    assert.equal(arrowEngine.status(cleared.state), "gameOver");
    const result = arrowEngine.result(cleared.state);
    assert.equal(result.breakdown?.finishMs, cleared.state.finishMs);
  });

  it("opens on a square board", () => {
    const s = opened("s20");
    assert.equal(s.cols, s.rows);
    assert.ok(s.cols >= 4 && s.cols <= 6);
  });

  it("tick never times out a stopwatch run", () => {
    const s = opened("s25");
    const waiting = arrowEngine.tick(s, { now: s.roundStart + 60_000, rng: createRng("wait") });
    assert.equal(waiting.state.roundOver, false);
    assert.equal(waiting.state, s);
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
