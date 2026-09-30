/**
 * Shared engine test utilities: headless play, determinism, restore round-trips and contract checks.
 * Every engine test calls runConformance() plus its own rule-specific tests.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { createEventBus, memorySink } from "../analytics/bus";
import { GameEvent } from "../analytics/events";
import { ContentBundle, emptyBundle } from "../content/types";
import { validatePack } from "../content/validate";
import { createManualClock } from "../core/clock";
import { GameDefinition, parseDefinition } from "../core/definition";
import { GameEngine } from "../core/engine";
import { Rng, createRng } from "../core/rng";
import { SessionRunner } from "../session/runner";

export type HeadlessOptions<S, A, P> = {
  engine: GameEngine<S, A, P>;
  definition: GameDefinition;
  content?: ContentBundle;
  seed?: string;
  /** Picks the next action; return null to let time pass (ticks) instead. */
  pickAction: (state: S, rng: Rng, now: number) => A | null;
  /** Simulated ms between steps. */
  stepMs?: number;
  maxSteps?: number;
  /** Stop after this many steps (for mid-game snapshots). */
  stopAfter?: number;
  startLevel?: number;
};

export function playHeadless<S, A, P>(opts: HeadlessOptions<S, A, P>) {
  const clock = createManualClock();
  const sink = memorySink();
  const bus = createEventBus((e) => {
    throw e;
  });
  bus.addSink(sink);
  const runner = new SessionRunner({
    engine: opts.engine,
    definition: opts.definition,
    content: opts.content ?? emptyBundle,
    gameKey: `test_${opts.engine.meta.id}`,
    sessionId: "session-test",
    seed: opts.seed ?? "seed-test",
    clock,
    bus,
    wallClock: () => 1_700_000_000_000 + clock.now(),
    startLevel: opts.startLevel,
  });
  const actionRng = createRng(`${opts.seed ?? "seed-test"}/player`);
  const stepMs = opts.stepMs ?? 400;
  const maxSteps = opts.maxSteps ?? 5000;
  let steps = 0;
  let rejected = 0;
  runner.start();
  while (steps < maxSteps && (opts.stopAfter === undefined || steps < opts.stopAfter)) {
    const snap = runner.getSnapshot();
    if (snap.status === "completed" || snap.status === "abandoned" || snap.error) break;
    if (snap.status === "roundOver") runner.advance();
    else {
      const action = opts.pickAction(snap.state, actionRng, clock.now());
      if (action === null) runner.tick();
      else if (!runner.dispatch(action).accepted) rejected++;
    }
    clock.advance(stepMs);
    runner.tick();
    steps++;
  }
  return { runner, events: sink.events as GameEvent[], steps, rejected, clock };
}

/** Loads bundled fallback packs as a validated ContentBundle (tests use real editorial content). */
export function packBundle(...packIds: string[]): ContentBundle {
  const dir = path.join(__dirname, "..", "content", "packs");
  const items = packIds.flatMap((id) => {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), "utf8"));
    return validatePack(raw.items).items;
  });
  return { items, source: "fallback", packIds };
}

export function definition(raw: Record<string, unknown>): GameDefinition {
  const r = parseDefinition(raw);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

export type ConformanceOptions<S, A, P> = Omit<HeadlessOptions<S, A, P>, "seed" | "stopAfter"> & {
  name: string;
  /** An action the engine must reject in its first round. */
  invalidAction?: (state: S) => A;
  /** Expect the game to complete on its own (finite/timed games). */
  finite?: boolean;
};

export function runConformance<S, A, P>(opts: ConformanceOptions<S, A, P>) {
  describe(`${opts.name}: engine conformance`, () => {
    it("meta, difficulty dimensions and params are well formed", () => {
      const { engine } = opts;
      assert.ok(engine.meta.id && engine.meta.title);
      assert.ok(engine.meta.variations.length > 0);
      assert.ok(engine.difficulty.dimensions.length > 0);
      for (const lvl of [0, 0.5, 1]) assert.ok(engine.difficulty.paramsFor(lvl));
      assert.ok(engine.maxScore(opts.definition) > 0);
      assert.equal(engine.checkDefinition(opts.definition).ok, true);
    });

    it("rejects unknown variations", () => {
      const bad = { ...opts.definition, variation: "__nope__" };
      assert.equal(opts.engine.checkDefinition(bad).ok, false);
    });

    it("is deterministic for a seed", () => {
      const a = playHeadless({ ...opts, seed: "det" });
      const b = playHeadless({ ...opts, seed: "det" });
      assert.deepEqual(a.runner.serialize().engineState, b.runner.serialize().engineState);
      assert.equal(a.runner.getSnapshot().score, b.runner.getSnapshot().score);
    });

    it("generates different games for different seeds", () => {
      const s1 = playHeadless({ ...opts, seed: "one", stopAfter: 0 }).runner.serialize().engineState;
      const s2 = playHeadless({ ...opts, seed: "two", stopAfter: 0 }).runner.serialize().engineState;
      const s3 = playHeadless({ ...opts, seed: "three", stopAfter: 0 }).runner.serialize().engineState;
      assert.ok(JSON.stringify(s1) !== JSON.stringify(s2) || JSON.stringify(s1) !== JSON.stringify(s3));
    });

    it("plays to a valid end state with a bounded score", () => {
      const { runner, events } = playHeadless({ ...opts, seed: "full" });
      const snap = runner.getSnapshot();
      assert.equal(snap.error, undefined);
      if (opts.finite) assert.equal(snap.status, "completed");
      else runner.end();
      const result = runner.getSnapshot().result;
      assert.ok(result);
      assert.ok(result.score >= 0 && result.score <= opts.engine.maxScore(opts.definition));
      const types = new Set(events.map((e) => e.type));
      assert.ok(types.has("GAME_STARTED") && types.has("ROUND_STARTED"));
      if (opts.finite) assert.ok(types.has("GAME_COMPLETED"));
    });

    it("serializes and restores mid-game", () => {
      const { runner } = playHeadless({ ...opts, seed: "restore", stopAfter: 3 });
      const saved = JSON.parse(JSON.stringify(runner.serialize()));
      const restored = opts.engine.restore(saved.engineState);
      assert.ok(restored.ok, restored.ok ? "" : restored.error);
      if (restored.ok) assert.deepEqual(opts.engine.serialize(restored.value), saved.engineState);
      const resumed = new SessionRunner({
        engine: opts.engine,
        definition: opts.definition,
        content: opts.content ?? emptyBundle,
        gameKey: "restore",
        sessionId: saved.sessionId,
        seed: saved.seed,
        clock: createManualClock(saved.activeElapsedMs),
        restore: saved,
      });
      assert.ok(["paused", "completed", "ready"].includes(resumed.getSnapshot().status));
    });

    it("rejects malformed saved state", () => {
      for (const bad of [null, 42, "x", [], {}, { v: 999 }]) {
        assert.equal(opts.engine.restore(bad as never).ok, false);
      }
    });

    if (opts.invalidAction) {
      it("rejects invalid actions without changing state", () => {
        const { runner } = playHeadless({ ...opts, seed: "invalid", stopAfter: 0 });
        const before = JSON.stringify(runner.serialize().engineState);
        const res = runner.dispatch(opts.invalidAction!(runner.getSnapshot().state));
        assert.equal(res.accepted, false);
        assert.equal(JSON.stringify(runner.serialize().engineState), before);
      });
    }

    it("ignores actions after the game is over", () => {
      const { runner } = playHeadless({ ...opts, seed: "after" });
      runner.end();
      const action = opts.pickAction(runner.getSnapshot().state, createRng("x"), 0);
      if (action !== null) assert.equal(runner.dispatch(action).accepted, false);
    });
  });
}
