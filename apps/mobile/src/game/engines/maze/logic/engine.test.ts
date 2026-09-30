import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRng } from "../../../core/rng";
import { definition, playHeadless, runConformance } from "../../../testing/harness";
import { mazeMeta } from "../meta";
import { GEM_POINTS, MazeAction, MazeState } from "./engine";
import { DIR_BIT, Dir, E, N, S, W, countDeadEnds, distances, generateMaze, neighbour, open, shortestPath } from "./maze";
import { mazeEngine } from "./mazeEngine";

const DIRS: Dir[] = ["N", "E", "S", "W"];

/** Walks the shortest route to the next gem / exit, with occasional random steps. */
const solver = (s: MazeState, rng: { chance(p: number): boolean; pick<T>(x: readonly T[]): T }): MazeAction | null => {
  if (s.roundOver) return null;
  const openDirs = DIRS.filter((d) => open(s.walls, s.pos, DIR_BIT[d]));
  if (rng.chance(0.15)) return { type: "move", dir: rng.pick(openDirs) };
  const target = s.gems.find((g) => !s.got.includes(g)) ?? s.exit;
  const next = shortestPath(s.walls, s.size, s.pos, target)[1];
  if (next === undefined) return null;
  return { type: "move", dir: DIRS.find((d) => neighbour(s.pos, DIR_BIT[d], s.size) === next)! };
};

for (const v of mazeMeta.variations) {
  runConformance({
    name: `maze/${v.id}`,
    engine: mazeEngine,
    definition: definition({ engine: "maze", variation: v.id }),
    pickAction: solver,
    stepMs: 150,
    invalidAction: (s) => ({ type: "move", dir: DIRS.find((d) => !open(s.walls, s.pos, DIR_BIT[d]))! }),
    finite: true,
  });
}

describe("MazeGenerator", () => {
  it("produces a connected maze with consistent walls for every size and braid", () => {
    for (const size of [5, 8, 13]) {
      for (const braid of [0, 0.3, 1]) {
        const walls = generateMaze(createRng(`m${size}${braid}`), size, braid);
        assert.ok(distances(walls, size, 0).every((d) => d >= 0), "every cell reachable");
        for (let i = 0; i < walls.length; i++) {
          for (const [bit, opp] of [[N, S], [E, W], [S, N], [W, E]]) {
            const n = neighbour(i, bit, size);
            if (n < 0) assert.ok(!open(walls, i, bit), "border is closed");
            else assert.equal(open(walls, i, bit), open(walls, n, opp), "walls agree on both sides");
          }
        }
      }
    }
  });

  it("a perfect maze has exactly size^2 - 1 passages; braiding removes dead ends", () => {
    const size = 10;
    const perfect = generateMaze(createRng("p"), size, 0);
    const passages = perfect.reduce((n, w, i) => n + (open(perfect, i, E) ? 1 : 0) + (open(perfect, i, S) ? 1 : 0), 0);
    assert.equal(passages, size * size - 1);
    const braided = generateMaze(createRng("p"), size, 1);
    assert.ok(countDeadEnds(braided) < countDeadEnds(perfect) / 2);
  });

  it("is deterministic per seed", () => {
    assert.deepEqual(generateMaze(createRng("same"), 9, 0.2), generateMaze(createRng("same"), 9, 0.2));
  });
});

describe("maze rules", () => {
  const start = (variation: string, extra: Record<string, unknown> = {}) =>
    playHeadless({ engine: mazeEngine, definition: definition({ engine: "maze", variation, ...extra }), pickAction: () => null, stopAfter: 0 });

  it("the exit is the cell farthest from the start and par is the shortest route", () => {
    const s = start("classic").runner.getSnapshot().state;
    const d = distances(s.walls, s.size, s.start);
    assert.equal(d[s.exit], Math.max(...d));
    assert.equal(s.par, d[s.exit]);
  });

  it("walking the best route escapes with the full efficiency bonus", () => {
    const { runner } = start("classic", { roundCount: 1 });
    const s0 = runner.getSnapshot().state;
    const route = shortestPath(s0.walls, s0.size, s0.pos, s0.exit);
    for (let k = 1; k < route.length; k++) {
      const s = runner.getSnapshot().state;
      const dir = DIRS.find((d) => neighbour(s.pos, DIR_BIT[d], s.size) === route[k])!;
      assert.ok(runner.dispatch({ type: "move", dir }).accepted);
    }
    const s = runner.getSnapshot().state;
    assert.equal(s.escaped, true);
    assert.equal(s.steps, s.par);
    assert.equal(s.breakdown.efficiency, 30);
  });

  it("running follows corridors to the next junction", () => {
    const s0 = start("classic").runner.getSnapshot().state;
    const { runner } = start("classic");
    const dir = DIRS.find((d) => open(s0.walls, s0.pos, DIR_BIT[d]))!;
    runner.dispatch({ type: "move", dir, run: true });
    const s = runner.getSnapshot().state;
    assert.ok(s.steps >= 1);
    assert.equal(s.trail.length, s.steps + 1);
  });

  it("gem mazes keep the exit locked until every gem is collected", () => {
    const { runner } = start("gems", { roundCount: 1 });
    const s0 = runner.getSnapshot().state;
    assert.ok(s0.gems.length >= 2);
    const walk = (to: number) => {
      const s = runner.getSnapshot().state;
      const route = shortestPath(s.walls, s.size, s.pos, to);
      for (let k = 1; k < route.length && !runner.getSnapshot().state.roundOver; k++) {
        const cur = runner.getSnapshot().state;
        runner.dispatch({ type: "move", dir: DIRS.find((d) => neighbour(cur.pos, DIR_BIT[d], cur.size) === route[k])! });
      }
    };
    walk(s0.exit);
    const atExit = runner.getSnapshot().state;
    if (atExit.got.length < atExit.gems.length) assert.equal(atExit.roundOver, false);
    for (const g of s0.gems) walk(g);
    walk(s0.exit);
    const s = runner.getSnapshot().state;
    assert.equal(s.escaped, true);
    assert.equal(s.breakdown.gems, s0.gems.length * GEM_POINTS);
  });

  it("fog reveals cells around the player as they move", () => {
    const { runner } = start("fog");
    const s0 = runner.getSnapshot().state;
    assert.ok(s0.seen.length > 0 && s0.seen.length < s0.size * s0.size);
    const dir = DIRS.find((d) => open(s0.walls, s0.pos, DIR_BIT[d]))!;
    runner.dispatch({ type: "move", dir, run: true });
    assert.ok(runner.getSnapshot().state.seen.length > s0.seen.length);
  });

  it("the path hint points along the shortest route and costs points on escape", () => {
    const { runner } = start("classic", { roundCount: 1 });
    runner.useHint("path");
    const s = runner.getSnapshot().state;
    const route = shortestPath(s.walls, s.size, s.pos, s.exit);
    assert.deepEqual(s.hintPath, route.slice(1, 1 + s.hintPath.length));
    assert.equal(s.roundHints, 1);
  });

  it("running out of time ends the round without escape points", () => {
    const { runner, clock } = start("sprint");
    clock.advance(runner.getSnapshot().state.roundLimitMs + 1);
    runner.tick();
    const s = runner.getSnapshot().state;
    assert.equal(s.roundOver, true);
    assert.equal(s.escaped, false);
    assert.equal(s.score, 0);
  });
});
