#!/usr/bin/env node
"use strict";

/**
 * Ensures @shopify/react-native-skia copied its prebuilt Android libs/.
 * Works with hoisted and nested pnpm layouts on EAS Linux workers.
 */
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function findFrom(start, name) {
  try {
    const req = createRequire(path.join(start, "package.json"));
    return path.dirname(req.resolve(`${name}/package.json`));
  } catch {
    return null;
  }
}

function walkFind(name) {
  const candidates = [
    findFrom(process.cwd(), name),
    findFrom(path.join(process.cwd(), "apps", "mobile"), name),
  ].filter(Boolean);

  // Walk up from this script looking for node_modules/<name>
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const direct = path.join(dir, "node_modules", name);
    if (exists(path.join(direct, "package.json"))) candidates.push(direct);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return candidates[0] || null;
}

function androidReady(skiaRoot) {
  return exists(
    path.join(skiaRoot, "libs", "android", "arm64-v8a", "libskia.a")
  );
}

function findAndroidPkg(skiaRoot) {
  const nested = [
    path.join(skiaRoot, "node_modules", "react-native-skia-android"),
    path.join(path.dirname(skiaRoot), "react-native-skia-android"),
  ];
  for (const p of nested) {
    if (exists(path.join(p, "package.json"))) return p;
  }
  return (
    findFrom(skiaRoot, "react-native-skia-android") ||
    walkFind("react-native-skia-android")
  );
}

function copyAndroidLibs(skiaRoot) {
  const androidPkg = findAndroidPkg(skiaRoot);
  if (!androidPkg) {
    console.error("[ensure-skia-libs] react-native-skia-android not found");
    return false;
  }
  const srcAndroid = path.join(androidPkg, "libs", "android");
  const srcRoot = path.join(androidPkg, "libs");
  const src = exists(srcAndroid) ? srcAndroid : srcRoot;
  if (!exists(src)) {
    console.error("[ensure-skia-libs] Missing libs under", androidPkg);
    return false;
  }
  const dest = path.join(skiaRoot, "libs", "android");
  fs.rmSync(path.join(skiaRoot, "libs"), { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  // Package may already be libs/android/* or libs/*
  if (exists(path.join(src, "arm64-v8a"))) {
    fs.cpSync(src, dest, { recursive: true });
  } else if (exists(path.join(src, "android", "arm64-v8a"))) {
    fs.cpSync(path.join(src, "android"), dest, { recursive: true });
  } else {
    console.error("[ensure-skia-libs] Unexpected layout at", src);
    console.error("entries:", fs.readdirSync(src).slice(0, 20).join(", "));
    return false;
  }
  console.log("[ensure-skia-libs] Copied Android libs from", androidPkg);
  return androidReady(skiaRoot);
}

console.log(
  "[ensure-skia-libs] cwd=",
  process.cwd(),
  "script=",
  __filename
);

const skiaRoot =
  walkFind("@shopify/react-native-skia") ||
  findFrom(process.cwd(), "@shopify/react-native-skia") ||
  findFrom(path.join(process.cwd(), "apps", "mobile"), "@shopify/react-native-skia");

if (!skiaRoot) {
  console.error("[ensure-skia-libs] @shopify/react-native-skia not found");
  process.exit(1);
}
console.log("[ensure-skia-libs] skiaRoot=", skiaRoot);

if (androidReady(skiaRoot)) {
  console.log("[ensure-skia-libs] Skia Android libs already present");
  process.exit(0);
}

if (copyAndroidLibs(skiaRoot)) {
  console.log("[ensure-skia-libs] Skia Android libs ready");
  process.exit(0);
}

console.error("[ensure-skia-libs] Failed to materialize libskia.a for Android");
process.exit(1);
