import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventBus, memorySink } from "../analytics/bus";
import { emptyBundle } from "../content/types";
import { createClock, createManualClock } from "../core/clock";
import { SessionRunner } from "./runner";
import { demoEngine } from "../testing/demoEngine";
import { definition, playHeadless, runConformance } from "../testing/harness";

const def = definition({ engine: "demo", variation: "even", roundCount: 5 });

runConformance({
  name: "demo",
  engine: demoEngine,
  definition: def,
  finite: true,
  pickAction: (_s, rng) => ({ type: "answer", even: rng.chance(0.5) }),
  invalidAction: () => ({ type: "nope" }) as never,
});

function makeRunner(overrides: Partial<ConstructorParameters<typeof SessionRunner>[0]> = {}) {
  const clock = createManualClock();
  const sink = memorySink();
  const bus = createEventBus();
  bus.addSink(sink);
  const runner = new SessionRunner({
    engine: demoEngine,
    definition: def,
    content: emptyBundle,
    gameKey: "demo",
    sessionId: "s1",
    seed: "seed",
    clock,
    bus,
    ...overrides,
  } as ConstructorParameters<typeof SessionRunner>[0]);
  return { runner, clock, sink };
}

const perfect = (s: { n: number }) => ({ type: "answer" as const, even: s.n % 2 === 0 });

describe("SessionRunner", () => {
  it("does not accept actions before start", () => {
    const { runner } = makeRunner();
    assert.equal(runner.getSnapshot().status, "ready");
    assert.equal(runner.dispatch({ type: "answer", even: true }).accepted, false);
  });

  it("raises difficulty for a perfect player and emits standard events", () => {
    const { runner, events } = playHeadless({ engine: demoEngine, definition: def, pickAction: perfect });
    const snap = runner.getSnapshot();
    assert.equal(snap.status, "completed");
    assert.equal(snap.score, 50);
    assert.ok(snap.level > def.difficulty.start);
    const types = events.map((e) => e.type);
    for (const t of ["GAME_STARTED", "ROUND_STARTED", "ANSWER_CORRECT", "ROUND_COMPLETED", "DIFFICULTY_CHANGED", "STREAK_STARTED", "GAME_COMPLETED"]) {
      assert.ok(types.includes(t as never), t);
    }
    assert.ok(events.some((e) => e.type === "ENGINE" && e.name === "demo_answer"));
    assert.ok(events.every((e) => e.sessionId === "session-test" && e.engineId === "demo"));
  });

  it("records a per-round breakdown that adds up to the final score", () => {
    let i = 0;
    const { runner } = playHeadless({ engine: demoEngine, definition: def, pickAction: (s) => ({ type: "answer", even: i++ % 2 ? s.n % 2 !== 0 : s.n % 2 === 0 }) });
    const rounds = runner.rounds;
    assert.equal(rounds.length, 5);
    assert.deepEqual(rounds.map((r) => r.round), [1, 2, 3, 4, 5]);
    assert.equal(rounds.reduce((s, r) => s + r.points, 0), runner.getSnapshot().score);
    assert.equal(rounds.reduce((s, r) => s + r.correct, 0), runner.getSnapshot().result!.correct);
    assert.ok(rounds.some((r) => r.correct === 0) && rounds.some((r) => r.correct === 1));
  });

  it("does not record an empty round when a session is ended early", () => {
    const { runner } = playHeadless({ engine: demoEngine, definition: def, pickAction: perfect, stopAfter: 2 });
    runner.end();
    assert.ok(runner.rounds.every((r) => r.attempts > 0));
  });

  it("lowers difficulty for a struggling player and reports broken streaks", () => {
    let i = 0;
    const { runner, events } = playHeadless({
      engine: demoEngine,
      definition: definition({ engine: "demo", variation: "even", roundCount: 8, difficulty: { start: 0.5 } }),
      pickAction: (s) => ({ type: "answer", even: i++ < 3 ? s.n % 2 === 0 : s.n % 2 !== 0 }),
    });
    assert.ok(runner.getSnapshot().level < 0.5);
    assert.ok(events.some((e) => e.type === "STREAK_BROKEN"));
  });

  it("fixed controller never changes level", () => {
    const { runner } = playHeadless({
      engine: demoEngine,
      definition: definition({ engine: "demo", variation: "even", roundCount: 5, difficulty: { controller: "fixed", start: 0.2 } }),
      pickAction: perfect,
    });
    assert.equal(runner.getSnapshot().level, 0.2);
  });

  it("pause stops the clock and blocks input; resume restores prior status", () => {
    let t = 0;
    const clock = createClock({ source: () => t });
    const { runner } = makeRunner({ clock });
    runner.start();
    t = 1000;
    runner.pause();
    t = 60_000;
    assert.equal(runner.durationMs, 1000);
    assert.equal(runner.dispatch({ type: "answer", even: true }).accepted, false);
    runner.resume();
    assert.equal(runner.getSnapshot().status, "playing");
    t = 61_000;
    assert.equal(runner.durationMs, 2000);
  });

  it("end() completes with the current score; abandon() does not complete", () => {
    const a = makeRunner();
    a.runner.start();
    a.runner.dispatch(perfect(a.runner.getSnapshot().state));
    a.runner.end();
    assert.equal(a.runner.getSnapshot().status, "completed");
    assert.equal(a.runner.getSnapshot().result?.score, 10);

    const b = makeRunner();
    b.runner.start();
    b.runner.abandon();
    assert.equal(b.runner.getSnapshot().status, "abandoned");
    assert.ok(b.sink.events.some((e) => e.type === "GAME_ABANDONED"));
    b.runner.end();
    assert.equal(b.runner.getSnapshot().status, "abandoned");
  });

  it("clamps scores to definition.maxScore", () => {
    const { runner } = playHeadless({
      engine: demoEngine,
      definition: definition({ engine: "demo", variation: "even", roundCount: 5, maxScore: 25 }),
      pickAction: perfect,
    });
    assert.equal(runner.getSnapshot().result?.score, 25);
  });

  it("restores a live session as paused with identical state", () => {
    const { runner } = makeRunner();
    runner.start();
    runner.dispatch(perfect(runner.getSnapshot().state));
    const saved = JSON.parse(JSON.stringify(runner.serialize()));
    const { runner: restored, sink } = makeRunner({ restore: saved, clock: createManualClock(saved.activeElapsedMs) });
    assert.equal(restored.getSnapshot().status, "paused");
    assert.deepEqual(restored.serialize().engineState, saved.engineState);
    assert.ok(sink.events.some((e) => e.type === "GAME_RESTORED"));
    restored.resume();
    assert.equal(restored.getSnapshot().status, "roundOver");
  });

  it("isolates engine exceptions as an error state", () => {
    const throwing = { ...demoEngine, reduce: () => { throw new Error("kaboom"); } };
    const { runner, sink } = makeRunner({ engine: throwing });
    runner.start();
    const res = runner.dispatch({ type: "answer", even: true });
    assert.equal(res.accepted, false);
    assert.equal(runner.getSnapshot().error, "kaboom");
    assert.ok(sink.events.some((e) => e.type === "GAME_ERROR"));
  });

  it("caps the action log", () => {
    const { runner } = playHeadless({
      engine: demoEngine,
      definition: definition({ engine: "demo", variation: "even", roundCount: 200 }),
      pickAction: perfect,
    });
    assert.ok(runner.serialize().actions.length <= 400);
    assert.equal(runner.serialize().actionCount >= 200, true);
  });
});
