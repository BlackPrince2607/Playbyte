import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { playHeadless, definition } from "../testing/harness";
import { demoEngine } from "../testing/demoEngine";
import { createLevelStore, createSessionStore } from "./store";
import { createSubmitQueue, idempotencyKeyFor, savePlay } from "./submitQueue";
import { CompletedPlay, memoryStore } from "./types";

const def = definition({ engine: "demo", variation: "even", roundCount: 5 });

describe("session store", () => {
  it("saves live sessions and loads them back", async () => {
    const kv = memoryStore();
    const store = createSessionStore(kv);
    const { runner } = playHeadless({ engine: demoEngine, definition: def, pickAction: () => ({ type: "answer", even: true }), stopAfter: 2 });
    const s = runner.serialize();
    await store.save(s);
    const loaded = await store.load(s.updatedAt + 1000);
    assert.equal(loaded?.sessionId, s.sessionId);
  });

  it("drops stale, finished and corrupted sessions", async () => {
    const kv = memoryStore();
    const store = createSessionStore(kv, { maxAgeMs: 1000 });
    const { runner } = playHeadless({ engine: demoEngine, definition: def, pickAction: () => ({ type: "answer", even: true }), stopAfter: 1 });
    const s = runner.serialize();
    await store.save(s);
    assert.equal(await store.load(s.updatedAt + 5000), null);
    await store.save({ ...s, status: "completed" });
    assert.equal(kv.data.size, 0);
    await kv.setItem("playbyte.game.session.active", "{not json");
    assert.equal(await store.load(), null);
    assert.equal(kv.data.size, 0);
  });
});

describe("level store", () => {
  it("round-trips and clamps", async () => {
    const levels = createLevelStore(memoryStore());
    assert.equal(await levels.get("guess", "flag"), undefined);
    await levels.set("guess", "flag", 1.7);
    assert.equal(await levels.get("guess", "flag"), 1);
    await levels.set("guess", "flag", 0.42);
    assert.equal(await levels.get("guess", "flag"), 0.42);
  });
});

describe("submit queue", () => {
  const play: CompletedPlay = { gameKey: "guess_flag", score: 70, durationMs: 30_000, sessionId: "abc" };

  it("keeps failed plays and flushes them later with the same idempotency key", async () => {
    const kv = memoryStore();
    let online = false;
    const seen: string[] = [];
    const q = createSubmitQueue(kv, async (p) => {
      seen.push(p.idempotencyKey);
      if (!online) throw new Error("offline");
      return { ok: true };
    });
    await assert.rejects(q.submit(play));
    assert.equal((await q.pending()).length, 1);
    online = true;
    assert.equal(await q.flush(), 1);
    assert.equal((await q.pending()).length, 0);
    assert.ok(seen.every((k) => k === idempotencyKeyFor(play)));
  });

  it("drops permanently rejected plays and resubmitting replaces instead of duplicating", async () => {
    const kv = memoryStore();
    const q = createSubmitQueue(kv, async () => {
      throw Object.assign(new Error("422"), { permanent: true });
    });
    await assert.rejects(q.submit(play));
    assert.equal((await q.pending()).length, 0);

    const q2 = createSubmitQueue(memoryStore(), async () => {
      throw new Error("offline");
    });
    await assert.rejects(q2.submit(play));
    await assert.rejects(q2.submit(play));
    assert.equal((await q2.pending()).length, 1);
  });
});

describe("saving a finished play for the result screen", () => {
  const play: CompletedPlay = { gameKey: "guess_flag", score: 70, durationMs: 30_000, sessionId: "abc" };
  const ok = { score: 72, percentile: 81, promptAccountCreation: true };
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("shows the server's score once saved", async () => {
    const q = createSubmitQueue(memoryStore(), async () => ok);
    assert.deepEqual(await savePlay(q, play), { score: 72, percentile: 81, saveState: "saved", promptAccountCreation: true });
    assert.equal((await q.pending()).length, 0);
  });

  it("keeps the local score and the queued play when offline, then saves it on retry", async () => {
    let online = false;
    const keys: string[] = [];
    const q = createSubmitQueue(memoryStore(), async (p) => {
      keys.push(p.idempotencyKey);
      if (!online) throw new Error("offline");
      return ok;
    });
    assert.deepEqual(await savePlay(q, play), { score: 70, percentile: null, saveState: "queued" });
    assert.equal((await q.pending()).length, 1);

    online = true;
    assert.equal((await savePlay(q, play)).saveState, "saved");
    await settle();
    assert.equal((await q.pending()).length, 0);
    assert.deepEqual(keys, [idempotencyKeyFor(play), idempotencyKeyFor(play)]);
  });

  it("reports a rejected play with the server's message and does not keep it", async () => {
    const q = createSubmitQueue(memoryStore(), async () => {
      throw Object.assign(new Error("422"), { permanent: true, userMessage: "Unknown game." });
    });
    const out = await savePlay(q, play, (e) => (e as { userMessage?: string }).userMessage);
    assert.deepEqual(out, { score: 70, percentile: null, saveState: "rejected", saveMessage: "Unknown game." });
    assert.equal((await q.pending()).length, 0);
  });

  it("sends plays queued earlier once a save goes through", async () => {
    let online = false;
    const sent: string[] = [];
    const q = createSubmitQueue(memoryStore(), async (p) => {
      if (!online) throw new Error("offline");
      sent.push(p.sessionId);
      return ok;
    });
    await savePlay(q, { ...play, sessionId: "earlier" });
    online = true;
    await savePlay(q, play);
    await q.flush();
    assert.deepEqual(sent.sort(), ["abc", "earlier"]);
    assert.equal((await q.pending()).length, 0);
  });
});
