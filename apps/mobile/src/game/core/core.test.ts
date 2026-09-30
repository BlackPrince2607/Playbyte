import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LEGACY_REPLACEMENTS } from "../engines/replacements";
import { parseDefinition } from "./definition";
import { createRegistry } from "./registry";
import { resolveGame } from "./resolve";
import { createRng } from "./rng";

describe("rng", () => {
  it("is deterministic for a seed", () => {
    const a = createRng("seed-1");
    const b = createRng("seed-1");
    const xs = Array.from({ length: 20 }, () => a.next());
    const ys = Array.from({ length: 20 }, () => b.next());
    assert.deepEqual(xs, ys);
  });

  it("differs across seeds and forks", () => {
    assert.notEqual(createRng("a").next(), createRng("b").next());
    const r = createRng("a");
    assert.equal(r.fork("x").next(), createRng("a").fork("x").next());
    assert.notEqual(r.fork("x").next(), r.fork("y").next());
  });

  it("int stays in range and shuffle is a permutation", () => {
    const r = createRng("range");
    for (let i = 0; i < 500; i++) {
      const n = r.int(3, 7);
      assert.ok(n >= 3 && n <= 7);
    }
    const items = [1, 2, 3, 4, 5, 6];
    assert.deepEqual([...r.shuffle(items)].sort(), items);
    assert.equal(r.sample(items, 3).length, 3);
    assert.throws(() => r.pick([]));
  });
});

describe("parseDefinition", () => {
  it("applies defaults", () => {
    const r = parseDefinition({ engine: "guess", variation: "flag" });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.value.roundCount, null);
    assert.equal(r.value.difficulty.start, 0.3);
    assert.equal(r.value.difficulty.controller, "staircase");
    assert.deepEqual(r.value.rules, {});
  });

  it("rejects malformed configs", () => {
    assert.equal(parseDefinition(null).ok, false);
    assert.equal(parseDefinition({ engine: "guess" }).ok, false);
    assert.equal(parseDefinition({ engine: "guess", variation: "flag", roundCount: 0 }).ok, false);
    assert.equal(parseDefinition({ engine: "guess", variation: "flag", difficulty: { start: 2 } }).ok, false);
    assert.equal(
      parseDefinition({ engine: "guess", variation: "flag", difficulty: { min: 0.8, max: 0.2 } }).ok,
      false,
    );
  });

  it("clamps start into [min, max] and drops non-numeric scoring", () => {
    const r = parseDefinition({
      engine: "guess",
      variation: "flag",
      difficulty: { start: 0.1, min: 0.4 },
      scoring: { base: 10, bad: "x" },
    });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.value.difficulty.start, 0.4);
    assert.deepEqual(r.value.scoring, { base: 10 });
  });
});

describe("registry", () => {
  const meta = { id: "demo", title: "Demo", variations: [], interaction: "choice" as const };

  it("loads lazily and caches", async () => {
    let loads = 0;
    const reg = createRegistry<{ n: number }>();
    reg.register({ meta, load: async () => ({ n: ++loads }) });
    assert.equal(loads, 0);
    assert.equal((await reg.load("demo")).n, 1);
    assert.equal((await reg.load("demo")).n, 1);
    reg.evict("demo");
    assert.equal((await reg.load("demo")).n, 2);
  });

  it("rejects duplicates and unknown ids, retries failed loads", async () => {
    const reg = createRegistry<number>();
    let attempt = 0;
    reg.register({
      meta,
      load: async () => {
        attempt++;
        if (attempt === 1) throw new Error("boom");
        return 7;
      },
    });
    assert.throws(() => reg.register({ meta, load: async () => 1 }));
    await assert.rejects(reg.load("nope"));
    await assert.rejects(reg.load("demo"));
    assert.equal(await reg.load("demo"), 7);
  });
});

describe("resolveGame", () => {
  const deps = {
    hasEngine: (id: string) => id === "guess",
    replacements: { flag_rush: { engine: "guess", variation: "flag", roundCount: 10 } },
  };

  it("resolves SDK engines from config", () => {
    const r = resolveGame({ key: "guess_movie", title: "t", blurb: "", config: { engine: "guess", variation: "movie" } }, deps);
    assert.equal(r.kind, "sdk");
  });

  it("maps retired legacy keys to their replacement", () => {
    const r = resolveGame({ key: "flag_rush", title: "t", blurb: "", config: { maxScore: 100 } }, deps);
    assert.equal(r.kind, "sdk");
    if (r.kind === "sdk") assert.equal(r.definition.variation, "flag");
  });

  it("treats retired off-map games and unknown engines as unavailable", () => {
    assert.equal(resolveGame({ key: "lane_dash", title: "t", blurb: "" }, deps).kind, "unavailable");
    assert.equal(resolveGame({ key: "nope", title: "t", blurb: "" }, deps).kind, "unavailable");
    assert.equal(resolveGame({ key: "x", title: "t", blurb: "", engine: "maze", variation: "exit" }, deps).kind, "unavailable");
    assert.equal(resolveGame({ key: "x", title: "t", blurb: "", engine: "guess" }, deps).kind, "unavailable");
  });

  it("every replacement is a valid SDK definition", () => {
    for (const [key, raw] of Object.entries(LEGACY_REPLACEMENTS)) {
      const parsed = parseDefinition(raw);
      assert.ok(parsed.ok, `${key}: ${parsed.ok ? "" : parsed.error}`);
    }
  });
});
