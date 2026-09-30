/**
 * Cross-engine budgets: round generation stays fast and saved sessions stay small, for every
 * registered engine and variation at the easiest and hardest level. Budgets are for Node on a dev
 * machine; Hermes on a low-end phone is several times slower, so they are deliberately tight.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { missingContent } from "../content/query";
import type { GameEngine } from "../core/engine";
import { createRng } from "../core/rng";
import { definition, packBundle, playHeadless } from "../testing/harness";
import { choiceEngine } from "./choice/logic/choice";
import { connectDotsEngine } from "./connect-dots/logic/connectDots";
import { emojiGuessEngine } from "./emoji-guess/logic/engine";
import { factFakeEngine } from "./fact-fake/logic/engine";
import { guessEngine } from "./guess/logic/engine";
import { engineRegistry } from "./index";
import { registerEngines } from "./manifest";
import { mazeEngine } from "./maze/logic/mazeEngine";
import { oddOneOutEngine } from "./odd-one-out/logic/engine";
import { LEGACY_REPLACEMENTS } from "./replacements";
import { spotEngine } from "./spot-difference/logic/spot";
import { tapDontTapEngine } from "./tap-dont-tap/logic/tapDontTap";
import { tapEngine } from "./tap/logic/tap";
import { wordSearchEngine } from "./word-search/logic/wordSearch";

/** Mean ms for init + first round (what the player waits for behind the countdown). */
const START_BUDGET_MS = 40;
/** Mean ms per generateRound (runs between rounds, must not drop frames noticeably). */
const ROUND_BUDGET_MS = 25;
/** Saved session JSON (written to AsyncStorage at every round end). */
const SESSION_BUDGET_BYTES = 48 * 1024;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ENGINES: GameEngine<any, any, any>[] = [
  guessEngine,
  emojiGuessEngine,
  oddOneOutEngine,
  tapEngine,
  wordSearchEngine,
  spotEngine,
  factFakeEngine,
  choiceEngine,
  tapDontTapEngine,
  mazeEngine,
  connectDotsEngine,
];

const packsDir = path.join(__dirname, "..", "content", "packs");
const content = packBundle(...fs.readdirSync(packsDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")));
const SEEDS = ["p1", "p2", "p3", "p4"];

describe("engine budgets", () => {
  it("covers every registered engine", () => {
    registerEngines();
    assert.deepEqual(
      engineRegistry.list().map((m) => m.id).sort(),
      ENGINES.map((e) => e.meta.id).sort(),
    );
  });

  it("legacy replacements point at registered engines and variations", () => {
    registerEngines();
    for (const [key, raw] of Object.entries(LEGACY_REPLACEMENTS)) {
      const meta = engineRegistry.meta(String(raw.engine));
      assert.ok(meta, `${key}: engine ${raw.engine}`);
      assert.ok(meta.variations.some((v) => v.id === raw.variation), `${key}: variation ${raw.variation}`);
    }
  });

  for (const engine of ENGINES) {
    for (const v of engine.meta.variations) {
      const def = definition({ engine: engine.meta.id, variation: v.id });
      // Remote-only variations (no bundled fallback pack) are covered once their pack is downloaded.
      const remoteOnly = !!missingContent(content, engine.contentNeeds(def));
      it(`${engine.meta.id}/${v.id}: fast rounds, small saved sessions`, { skip: remoteOnly && "remote-only content" }, () => {
        for (const level of [0, 1]) {
          let startMs = 0;
          let roundMs = 0;
          let rounds = 0;
          for (const seed of SEEDS) {
            const t0 = performance.now();
            const { runner } = playHeadless({ engine, definition: def, content, seed, startLevel: level, pickAction: () => null, stopAfter: 0 });
            startMs += performance.now() - t0;

            const size = JSON.stringify(runner.serialize()).length;
            assert.ok(size < SESSION_BUDGET_BYTES, `${v.id}@${level}: session ${size} bytes`);
            assert.equal(runner.getSnapshot().error, undefined);

            const state = runner.getSnapshot().state;
            const params = engine.difficulty.paramsFor(level);
            for (let i = 0; i < 5; i++) {
              const t1 = performance.now();
              engine.generateRound(state, { rng: createRng(`${seed}/r${i}`), params, level, now: 0 });
              roundMs += performance.now() - t1;
              rounds++;
            }
          }
          const meanStart = startMs / SEEDS.length;
          assert.ok(meanStart < START_BUDGET_MS, `${v.id}@${level}: start ${meanStart.toFixed(1)}ms`);
          assert.ok(roundMs / rounds < ROUND_BUDGET_MS, `${v.id}@${level}: round ${(roundMs / rounds).toFixed(1)}ms`);
        }
      });
    }
  }
});
