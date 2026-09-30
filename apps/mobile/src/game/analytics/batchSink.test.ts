import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { memoryStore } from "../session/types";
import { createBatchSink } from "./batchSink";
import type { GameEvent } from "./events";

const ev = (type: GameEvent["type"], round = 1): GameEvent => ({
  type,
  sessionId: "s1",
  gameKey: "guess_flag",
  engineId: "guess",
  engineVersion: 1,
  variation: "flag",
  round,
  seed: "x",
  clockMs: 0,
  ts: 0,
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("batch analytics sink", () => {
  it("drops per-tap noise and flushes on session end", async () => {
    const batches: GameEvent[][] = [];
    const s = createBatchSink({ storage: memoryStore(), send: async (b) => void batches.push(b) });
    s.sink(ev("GAME_STARTED"));
    s.sink(ev("ACTION_PERFORMED"));
    s.sink(ev("ANSWER_CORRECT"));
    s.sink(ev("ANSWER_SUBMITTED"));
    assert.equal(s.size(), 2);
    s.sink(ev("GAME_COMPLETED"));
    await s.flush();
    assert.deepEqual(
      batches.flat().map((e) => e.type),
      ["GAME_STARTED", "ANSWER_SUBMITTED", "GAME_COMPLETED"],
    );
    assert.equal(s.size(), 0);
  });

  it("sends in batches once the batch size is reached", async () => {
    const batches: GameEvent[][] = [];
    const s = createBatchSink({ storage: memoryStore(), send: async (b) => void batches.push(b), batchSize: 3 });
    for (let i = 0; i < 7; i++) s.sink(ev("ROUND_STARTED", i));
    await s.flush();
    await s.flush();
    assert.deepEqual(batches.map((b) => b.length), [3, 3, 1]);
  });

  it("keeps events after a failure and backs off before retrying", async () => {
    let t = 0;
    let fail = true;
    const sent: GameEvent[] = [];
    const s = createBatchSink({
      storage: memoryStore(),
      now: () => t,
      send: async (b) => {
        if (fail) throw new Error("offline");
        sent.push(...b);
      },
    });
    s.sink(ev("GAME_STARTED"));
    assert.equal(await s.flush(), 0);
    assert.equal(s.size(), 1);
    fail = false;
    assert.equal(await s.flush(), 0, "still backing off");
    t = 2_000;
    assert.equal(await s.flush(), 1);
    assert.equal(sent.length, 1);
  });

  it("drops a batch the server rejects as malformed", async () => {
    const s = createBatchSink({
      storage: memoryStore(),
      send: async () => {
        throw Object.assign(new Error("bad"), { permanent: true });
      },
    });
    s.sink(ev("GAME_STARTED"));
    await s.flush();
    assert.equal(s.size(), 0);
  });

  it("restores events persisted by a previous run", async () => {
    const storage = memoryStore();
    const first = createBatchSink({ storage, send: async () => Promise.reject(new Error("offline")) });
    first.sink(ev("GAME_STARTED"));
    first.sink(ev("ROUND_STARTED"));
    await first.persist();

    const sent: GameEvent[] = [];
    const second = createBatchSink({ storage, send: async (b) => void sent.push(...b) });
    await second.flush();
    assert.deepEqual(sent.map((e) => e.type), ["GAME_STARTED", "ROUND_STARTED"]);
    assert.equal(await storage.getItem("playbyte.game.events"), null);
  });

  it("gives every queued event a unique id the server accepts", async () => {
    const sent: GameEvent[] = [];
    const s = createBatchSink({ storage: memoryStore(), send: async (b) => void sent.push(...b) });
    for (let i = 0; i < 5; i++) s.sink(ev("ROUND_STARTED", i));
    await s.flush();
    const ids = sent.map((e) => e.eventId);
    assert.equal(new Set(ids).size, 5);
    for (const id of ids) assert.match(id ?? "", /^[A-Za-z0-9_.:-]{8,64}$/);
  });

  it("resends a failed batch with the same event ids", async () => {
    let t = 0;
    const attempts: (string | undefined)[][] = [];
    const s = createBatchSink({
      storage: memoryStore(),
      now: () => t,
      send: async (b) => {
        attempts.push(b.map((e) => e.eventId));
        if (attempts.length === 1) throw new Error("timeout after the server stored it");
      },
    });
    s.sink(ev("GAME_STARTED"));
    s.sink(ev("ROUND_STARTED"));
    await s.flush();
    t = 2_000;
    await s.flush();
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[1], attempts[0]);
  });

  it("keeps event ids across a restart and assigns ids to events saved without one", async () => {
    const storage = memoryStore();
    await storage.setItem("playbyte.game.events", JSON.stringify([ev("GAME_STARTED")]));
    const first = createBatchSink({ storage, send: async () => Promise.reject(new Error("offline")) });
    first.sink(ev("ROUND_STARTED"));
    await first.persist();
    const saved = (JSON.parse((await storage.getItem("playbyte.game.events")) ?? "[]") as GameEvent[]).map((e) => e.eventId);
    assert.equal(saved.length, 2);
    assert.ok(saved.every(Boolean));

    const sent: GameEvent[] = [];
    const second = createBatchSink({ storage, send: async (b) => void sent.push(...b) });
    second.sink(ev("GAME_COMPLETED"));
    await second.flush();
    assert.deepEqual(sent.slice(0, 2).map((e) => e.eventId), saved);
    assert.equal(new Set(sent.map((e) => e.eventId)).size, 3);
  });

  it("gives every queued event a unique id the server accepts", async () => {
    const sent: GameEvent[] = [];
    const s = createBatchSink({ storage: memoryStore(), send: async (b) => void sent.push(...b) });
    for (let i = 0; i < 5; i++) s.sink(ev("ROUND_STARTED", i));
    await s.flush();
    const ids = sent.map((e) => e.eventId);
    assert.equal(new Set(ids).size, 5);
    for (const id of ids) assert.match(id ?? "", /^[A-Za-z0-9_.:-]{8,64}$/);
  });

  it("resends a failed batch with the same event ids", async () => {
    let t = 0;
    const attempts: (string | undefined)[][] = [];
    const s = createBatchSink({
      storage: memoryStore(),
      now: () => t,
      send: async (b) => {
        attempts.push(b.map((e) => e.eventId));
        if (attempts.length === 1) throw new Error("timeout after the server stored it");
      },
    });
    s.sink(ev("GAME_STARTED"));
    s.sink(ev("ROUND_STARTED"));
    await s.flush();
    t = 2_000;
    await s.flush();
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[1], attempts[0]);
  });

  it("keeps event ids across a restart and assigns ids to events saved without one", async () => {
    const storage = memoryStore();
    await storage.setItem("playbyte.game.events", JSON.stringify([ev("GAME_STARTED")]));
    const first = createBatchSink({ storage, send: async () => Promise.reject(new Error("offline")) });
    first.sink(ev("ROUND_STARTED"));
    await first.persist();
    const saved = (JSON.parse((await storage.getItem("playbyte.game.events")) ?? "[]") as GameEvent[]).map((e) => e.eventId);
    assert.equal(saved.length, 2);
    assert.ok(saved.every(Boolean));

    const sent: GameEvent[] = [];
    const second = createBatchSink({ storage, send: async (b) => void sent.push(...b) });
    second.sink(ev("GAME_COMPLETED"));
    await second.flush();
    assert.deepEqual(sent.slice(0, 2).map((e) => e.eventId), saved);
    assert.equal(new Set(sent.map((e) => e.eventId)).size, 3);
  });

  it("caps the queue, dropping the oldest events", async () => {
    const s = createBatchSink({ storage: memoryStore(), send: async () => Promise.reject(new Error("x")), maxQueue: 5, batchSize: 100 });
    await tick();
    for (let i = 0; i < 9; i++) s.sink(ev("ROUND_STARTED", i));
    assert.equal(s.size(), 5);
  });
});
