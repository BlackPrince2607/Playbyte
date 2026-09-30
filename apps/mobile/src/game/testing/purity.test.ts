/**
 * Architecture guard: game logic must stay free of React / React Native / Expo so it is
 * deterministic and unit-testable in Node. UI lives in game/ui and engines/<id>/ui.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const gameRoot = path.resolve(__dirname, "..");
const PURE_DIRS = ["core", "session", "scoring", "difficulty", "content", "analytics", "testing"];
const FORBIDDEN = /from\s+["'](react|react-native|expo-[\w-]+|@react-native[\w/-]*|@shopify\/[\w-]+)["']/;

function tsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return tsFiles(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

function pureFiles(): string[] {
  const files = PURE_DIRS.flatMap((d) => tsFiles(path.join(gameRoot, d)));
  const enginesDir = path.join(gameRoot, "engines");
  if (fs.existsSync(enginesDir)) {
    for (const e of fs.readdirSync(enginesDir, { withFileTypes: true })) {
      if (e.isDirectory()) files.push(...tsFiles(path.join(enginesDir, e.name, "logic")));
    }
  }
  return files;
}

describe("game logic purity", () => {
  it("pure folders never import React, React Native or Expo", () => {
    const offenders = pureFiles().filter((f) => FORBIDDEN.test(fs.readFileSync(f, "utf8")));
    assert.deepEqual(offenders.map((f) => path.relative(gameRoot, f)), []);
  });

  it("pure folders never call Math.random", () => {
    const allowed = new Set([path.join(gameRoot, "core", "rng.ts")]);
    const offenders = pureFiles().filter(
      (f) => !allowed.has(f) && !f.endsWith(".test.ts") && /Math\.random\(/.test(fs.readFileSync(f, "utf8")),
    );
    assert.deepEqual(offenders.map((f) => path.relative(gameRoot, f)), []);
  });
});
