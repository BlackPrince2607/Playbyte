#!/usr/bin/env node
"use strict";

/**
 * Ensures @shopify/react-native-skia copied its prebuilt libs/ tree.
 * pnpm 10 may skip Skia's own postinstall; EAS Android only needs android libs.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function findPkgRoot(name) {
  try {
    return path.dirname(require.resolve(`${name}/package.json`));
  } catch {
    return null;
  }
}

function androidReady(skiaRoot) {
  const marker = path.join(
    skiaRoot,
    "libs",
    "android",
    "arm64-v8a",
    "libskia.a"
  );
  return fs.existsSync(marker);
}

function copyAndroidLibs(skiaRoot) {
  const androidPkg = findPkgRoot("react-native-skia-android");
  if (!androidPkg) {
    console.error(
      "[ensure-skia-libs] react-native-skia-android not installed — cannot copy libs"
    );
    return false;
  }
  const src = path.join(androidPkg, "libs", "android");
  if (!fs.existsSync(src)) {
    console.error("[ensure-skia-libs] Missing", src);
    return false;
  }
  const dest = path.join(skiaRoot, "libs", "android");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log("[ensure-skia-libs] Copied Android libs from", androidPkg);
  return androidReady(skiaRoot);
}

console.log(
  "[ensure-skia-libs] cwd=",
  process.cwd(),
  "script=",
  __filename
);

const skiaRoot = findPkgRoot("@shopify/react-native-skia");
if (!skiaRoot) {
  console.error(
    "[ensure-skia-libs] @shopify/react-native-skia not found from",
    process.cwd()
  );
  process.exit(1);
}
console.log("[ensure-skia-libs] skiaRoot=", skiaRoot);

if (androidReady(skiaRoot)) {
  console.log("[ensure-skia-libs] Skia Android libs already present");
  process.exit(0);
}

// Prefer a direct Android copy — install-libs.js hard-fails without Apple packages,
// which is brittle on Linux EAS Android workers.
if (copyAndroidLibs(skiaRoot)) {
  console.log("[ensure-skia-libs] Skia Android libs ready");
  process.exit(0);
}

const installer = path.join(skiaRoot, "scripts", "install-libs.js");
if (fs.existsSync(installer)) {
  console.log("[ensure-skia-libs] Falling back to install-libs.js…");
  const result = spawnSync(process.execPath, [installer], {
    cwd: skiaRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status === 0 && androidReady(skiaRoot)) {
    console.log("[ensure-skia-libs] Skia Android libs ready via install-libs");
    process.exit(0);
  }
}

console.error("[ensure-skia-libs] Failed to materialize libskia.a for Android");
process.exit(1);
