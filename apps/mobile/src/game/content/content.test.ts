import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { definition } from "../testing/harness";
import { AssetIndex, assetFileName } from "./assetIndex";
import { missingContent, selectItems } from "./query";
import { CachedPack, PackResponse, createContentRepository, packIdsFor } from "./repository";
import { validateItem, validatePack } from "./validate";

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "flag",
  categories: ["geo"],
  answer: `Answer ${id}`,
  difficulty: 0.3,
  status: "approved",
  ...extra,
});

describe("content validation", () => {
  it("accepts a well-formed item and fills defaults", () => {
    const r = validateItem(item("in", { media: [{ kind: "emoji", value: "🇮🇳" }] }));
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.value.locale, "en-IN");
      assert.equal(r.value.popularity, 0.5);
    }
  });

  it("rejects bad ids, ranges, media, blocked terms and answer-in-distractors", () => {
    assert.equal(validateItem(item("Bad Id")).ok, false);
    assert.equal(validateItem(item("a", { difficulty: 2 })).ok, false);
    assert.equal(validateItem(item("a", { media: [{ kind: "image", url: "http://x/y.png" }] })).ok, false);
    assert.equal(validateItem(item("a", { hints: ["what the fuck"] })).ok, false);
    assert.equal(validateItem(item("a", { answer: "India", attributes: { distractors: ["Nepal", "india "] } })).ok, false);
    assert.equal(validateItem(item("a", { facts: [{ text: "short", isTrue: "yes" }] })).ok, false);
  });

  it("does not flag substrings of innocent words", () => {
    assert.equal(validateItem(item("a", { answer: "Scunthorpe shitake grape" })).ok, true);
  });

  it("drops invalid, duplicate and non-approved items from packs", () => {
    const v = validatePack([item("a"), item("a"), item("b", { status: "draft" }), { id: 3 }]);
    assert.deepEqual(v.items.map((i) => i.id), ["a"]);
    assert.equal(v.rejected.length, 2);
  });

  it("selects by type and category and reports unmet needs", () => {
    const v = validatePack([item("a"), item("b", { categories: ["food"] }), item("c", { type: "food" })]);
    const bundle = { items: v.items, source: "remote" as const, packIds: [] };
    assert.equal(selectItems(bundle, { types: ["flag"], categories: ["geo"] }).length, 1);
    assert.equal(missingContent(bundle, [{ types: ["flag"], min: 2 }]), null);
    assert.ok(missingContent(bundle, [{ types: ["flag"], min: 3 }]));
  });
});

function memCache() {
  const m = new Map<string, CachedPack>();
  return { m, read: async (id: string) => m.get(id) ?? null, write: async (p: CachedPack) => void m.set(p.packId, p) };
}

describe("content repository", () => {
  const def = definition({ engine: "guess", variation: "flag" });

  it("prefers remote, then serves from cache within TTL, then revalidates with ETag", async () => {
    let t = 0;
    const calls: (string | undefined)[] = [];
    let respond: PackResponse = { status: 200, etag: "v1", items: [item("a"), item("b")] };
    const cache = memCache();
    const mk = () =>
      createContentRepository({
        fetchPack: async (_id, etag) => {
          calls.push(etag);
          return respond;
        },
        cache,
        fallback: async () => null,
        now: () => t,
        ttlMs: 1000,
      });
    const r1 = await mk().loadPack("flag");
    assert.equal(r1.source, "remote");
    t = 500;
    assert.equal((await mk().loadPack("flag")).source, "cache");
    assert.equal(calls.length, 1);
    t = 5000;
    respond = { status: 304 };
    const r3 = await mk().loadPack("flag");
    assert.equal(r3.source, "cache");
    assert.equal(r3.items.length, 2);
    assert.deepEqual(calls, [undefined, "v1"]);
  });

  it("falls back to the bundled pack when offline with no cache", async () => {
    const repo = createContentRepository({
      fetchPack: async () => {
        throw new Error("offline");
      },
      cache: memCache(),
      fallback: async (id) => (id === "flag" ? [item("x")] : null),
    });
    const b = await repo.load([{ types: ["flag"], min: 1 }], def);
    assert.equal(b.source, "fallback");
    assert.equal(b.items.length, 1);
    const none = await repo.load([{ types: ["unknown"], min: 1 }], def);
    assert.equal(none.source, "none");
  });

  it("derives pack ids from queries unless the definition pins one", () => {
    assert.deepEqual(packIdsFor([{ types: ["flag", "food"], min: 1 }, { types: ["flag"], min: 1 }], def), ["flag", "food"]);
    const pinned = definition({ engine: "guess", variation: "flag", content: { packId: "flags_asia" } });
    assert.deepEqual(packIdsFor([{ types: ["flag"], min: 1 }], pinned), ["flags_asia"]);
  });
});

describe("asset index", () => {
  it("evicts least recently used entries beyond the size cap", () => {
    let t = 0;
    const idx = new AssetIndex({ maxBytes: 100, ttlMs: 1e9, now: () => t });
    idx.put({ url: "a", file: "fa", bytes: 40, fetchedAt: 0 });
    t = 1;
    idx.put({ url: "b", file: "fb", bytes: 40, fetchedAt: 1 });
    t = 2;
    idx.get("a");
    t = 3;
    const evicted = idx.put({ url: "c", file: "fc", bytes: 40, fetchedAt: 3 });
    assert.deepEqual(evicted.map((e) => e.url), ["b"]);
    assert.equal(idx.totalBytes, 80);
  });

  it("expires entries past TTL and survives a JSON round-trip", () => {
    let t = 0;
    const idx = new AssetIndex({ maxBytes: 1000, ttlMs: 100, now: () => t });
    idx.put({ url: "a", file: "fa", bytes: 10, fetchedAt: 0 });
    idx.put({ url: "b", file: "fb", bytes: 10, fetchedAt: 0 });
    t = 50;
    const copy = new AssetIndex({ maxBytes: 1000, ttlMs: 100, now: () => t });
    copy.load(JSON.parse(JSON.stringify(idx.toJSON())));
    assert.equal(copy.totalBytes, 20);
    t = 500;
    assert.equal(copy.get("a"), undefined);
    assert.equal(copy.evict().length, 2);
    assert.equal(copy.totalBytes, 0);
  });

  it("names files stably with their extension", () => {
    assert.equal(assetFileName("https://x/y.png"), assetFileName("https://x/y.png"));
    assert.match(assetFileName("https://x/y.JPG?w=2"), /\.jpg$/);
    assert.notEqual(assetFileName("https://x/a.png"), assetFileName("https://x/b.png"));
  });
});

describe("bundled fallback packs", () => {
  const dir = path.join(__dirname, "packs");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

  it("stay within the 300 KB budget", () => {
    const total = files.reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
    assert.ok(total <= 300 * 1024, `fallback packs are ${total} bytes`);
  });

  for (const f of files) {
    it(`${f} validates cleanly`, () => {
      const pack = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      assert.equal(pack.packId, f.replace(/\.json$/, ""));
      const v = validatePack(pack.items);
      assert.deepEqual(v.rejected, []);
      assert.ok(v.items.length >= 8, `${f} has only ${v.items.length} items`);
    });
  }
});
