#!/usr/bin/env node
"use strict";

/**
 * Ensures @shopify/react-native-skia copied its prebuilt libs/ tree.
 * pnpm 10 skips dependency postinstall scripts unless approved; EAS builds
 * also need this after install in the monorepo.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function findSkiaRoot() {
  try {
    return path.dirname(
      require.resolve("@shopify/react-native-skia/package.json")
    );
  } catch {
    return null;
  }
}

function libsReady(skiaRoot) {
  const marker = path.join(
    skiaRoot,
    "libs",
    "android",
    "arm64-v8a",
    "libskia.a"
  );
  return fs.existsSync(marker);
}

const skiaRoot = findSkiaRoot();
if (!skiaRoot) {
  console.warn(
    "[ensure-skia-libs] @shopify/react-native-skia not found; skipping"
  );
  process.exit(0);
}

if (libsReady(skiaRoot)) {
  console.log("[ensure-skia-libs] Skia libs already present");
  process.exit(0);
}

const installer = path.join(skiaRoot, "scripts", "install-libs.js");
if (!fs.existsSync(installer)) {
  console.error("[ensure-skia-libs] Missing", installer);
  process.exit(1);
}

console.log("[ensure-skia-libs] Running Skia install-libs…", installer);
const result = spawnSync(process.execPath, [installer], {
  cwd: skiaRoot,
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  console.error(
    "[ensure-skia-libs] install-libs exited",
    result.status,
    result.error || ""
  );
  // Fall back to the package's CLI helper when the direct script fails on EAS/pnpm layouts.
  const fallback = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["--yes", "install-skia"],
    { cwd: skiaRoot, stdio: "inherit", env: process.env, shell: true }
  );
  if (fallback.status !== 0) {
    process.exit(fallback.status ?? result.status ?? 1);
  }
}

if (!libsReady(skiaRoot)) {
  console.error(
    "[ensure-skia-libs] install-libs finished but libskia.a is still missing"
  );
  process.exit(1);
}

console.log("[ensure-skia-libs] Skia libs ready");
