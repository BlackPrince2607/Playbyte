#!/usr/bin/env node
/**
 * Lightweight bundle-size report for the mobile app.
 *
 *   node scripts/size-report.mjs            export Android bundle, print report
 *   node scripts/size-report.mjs --check    also fail (exit 1) when over size-budget.json
 *   node scripts/size-report.mjs --skip-export   reuse .size-report/export
 *
 * Measures the Hermes JS bundle and every exported asset (fonts, images). Native library size
 * (APK/AAB) needs an EAS build; record those numbers in docs/game-sdk/size-baseline.md.
 * For a per-module breakdown run: EXPO_ATLAS=true npx expo export --platform android
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".size-report");
const exportDir = path.join(outDir, "export");
const args = new Set(process.argv.slice(2));

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [{ path: p, bytes: fs.statSync(p).size }];
  });
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

if (!args.has("--skip-export")) {
  fs.rmSync(exportDir, { recursive: true, force: true });
  const res = spawnSync("npx", ["expo", "export", "--platform", "android", "--output-dir", exportDir], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ?? "https://example.invalid" },
  });
  if (res.status !== 0) {
    console.error("[size-report] expo export failed");
    process.exit(res.status ?? 1);
  }
}

const files = walk(exportDir);
const bundles = files.filter((f) => /\.(hbc|js)$/.test(f.path) && f.path.includes(path.join("_expo", "static", "js")));
// Exported assets are content-hashed without extensions; metadata.json carries the real extension.
const metadata = JSON.parse(fs.readFileSync(path.join(exportDir, "metadata.json"), "utf8"));
const extByPath = new Map(
  (metadata.fileMetadata?.android?.assets ?? []).map((a) => [path.normalize(path.join(exportDir, a.path)), a.ext]),
);
const assets = files
  .filter((f) => f.path.includes(`${path.sep}assets${path.sep}`))
  .map((f) => ({ ...f, ext: extByPath.get(path.normalize(f.path)) ?? path.extname(f.path).slice(1) }));
const fonts = assets.filter((f) => /^(ttf|otf)$/i.test(f.ext));
const images = assets.filter((f) => /^(png|jpe?g|webp|gif)$/i.test(f.ext));

const sum = (xs) => xs.reduce((s, f) => s + f.bytes, 0);
const report = {
  generatedAt: new Date().toISOString(),
  platform: "android",
  jsBundleBytes: sum(bundles),
  assetBytes: sum(assets),
  fontCount: fonts.length,
  fontBytes: sum(fonts),
  imageCount: images.length,
  imageBytes: sum(images),
  largestAssets: [...assets]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 10)
    .map((f) => ({ file: `${path.relative(exportDir, f.path)}.${f.ext}`, bytes: f.bytes })),
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));

console.log("\nPlayByte mobile size report (android export)");
console.log(`  JS bundle (Hermes): ${kb(report.jsBundleBytes)}`);
console.log(`  Assets total:       ${kb(report.assetBytes)}  (${report.fontCount} fonts ${kb(report.fontBytes)}, ${report.imageCount} images ${kb(report.imageBytes)})`);
for (const a of report.largestAssets) console.log(`    ${kb(a.bytes).padStart(10)}  ${a.file}`);

if (args.has("--check")) {
  const budget = JSON.parse(fs.readFileSync(path.join(root, "size-budget.json"), "utf8"));
  const failures = [];
  for (const [key, limit] of Object.entries(budget.limits)) {
    const actual = report[key];
    if (typeof actual === "number" && actual > limit) failures.push(`${key}: ${actual} > ${limit}`);
  }
  if (failures.length) {
    console.error("\n[size-report] Over budget:\n  " + failures.join("\n  "));
    process.exit(1);
  }
  console.log("\n[size-report] Within budget.");
}
