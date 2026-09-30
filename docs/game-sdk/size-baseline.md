# Mobile size baseline and budgets

Measured 2026-09-29, before the Game Engine SDK refactor.

## Baseline

| Artifact | Size | How measured |
|---|---|---|
| Preview APK (EAS build `00751705`, Sept 21) | **140.9 MB** (140,881,939 bytes) | `Content-Length` of the EAS artifact URL |
| Hermes JS bundle, before the font/icon fix | 4.6 MB | `npx expo export --platform android` |
| Bundled assets, before the font/icon fix | ~13 MB, 58 files | same export |
| Hermes JS bundle, after the font/icon fix | **4.17 MB** | `pnpm --filter @playbyte/mobile size` |
| Bundled assets, after the font/icon fix | **1.58 MB**, 6 fonts, 0 images | same |
| App icons / splash (native resources) | ~0.5 MB | `apps/mobile/assets` |
| Hermes JS bundle, all 11 SDK engines + legacy adapter (end of Phase 11) | 4.48 MB (4590 KB) | same |
| Hermes JS bundle, legacy games removed (Phase 12) | **4.43 MB** (4533 KB) | same |

The preview APK was a universal build (armeabi-v7a, arm64-v8a, x86, x86_64) with R8 and resource
shrinking disabled, so native libraries dominated it. `@shopify/react-native-skia` alone ships roughly
50-60 MB of static libraries per ABI before linking.

### Fixes applied in Phase 0

- `App.tsx` imports each font weight from its subpath (`@expo-google-fonts/inter/400Regular`). The
  package root `require`s every weight, which bundled 39 unused font files.
- Icons import `@expo/vector-icons/Ionicons` instead of the package root, which pulled in all 19
  icon fonts (MaterialCommunityIcons alone is 1.3 MB) plus their glyph maps.
- `expo-build-properties`: R8 (`enableMinifyInReleaseBuilds`) and `enableShrinkResourcesInReleaseBuilds`.
- `app.config.js`: the `preview` EAS profile builds `arm64-v8a` only.
- `eas.json`: `production` builds an `app-bundle` (AAB), so Play delivers per-ABI splits.

### Still to measure (needs an EAS build)

- Preview APK size after the changes above (expected to drop sharply: one ABI instead of four).
- Production AAB size and Play per-device download size (`bundletool get-size total`).
- iOS: no iOS build has been produced yet.

Record new numbers in the table above after each EAS build.

## Budgets

Enforced in CI by `pnpm --filter @playbyte/mobile size:check` against `apps/mobile/size-budget.json`.

| Metric | Budget | Rationale |
|---|---|---|
| JS bundle (Hermes) | 4.5 MiB | +10% over today, which must cover all eight green-wave engines |
| Bundled assets | 1.8 MiB | Today's six fonts; engines must not add bundled images |
| Font files | 6 | Current set; new weights need a justification |
| Bundled images | 300 KB | Tiny UI glyphs only; game content images are remote |

Per engine: aim for at most ~150 KB of JS. Bundled fallback content (all engines together) should stay
under 300 KB. The on-device game asset cache is capped at 100 MB by default (`AssetCache`).

## Lazy loading on native

Metro produces one Hermes bundle per platform on native. `import()` of an engine module defers its
evaluation (and Hermes maps bytecode lazily), but does not create a separately downloaded chunk. The
size levers are therefore: remote content and assets, shared UI and dependencies, and native build
settings. Engines are still registered with lazy loaders so startup does not evaluate or initialise
any engine until it is launched.

## Adding a dependency

Every new dependency must be justified against functionality, bundle impact, runtime impact, and
whether existing dependencies (Reanimated, Gesture Handler, Skia, expo-haptics, expo-file-system)
already cover it. Run `pnpm --filter @playbyte/mobile size` before and after, and note the delta in
the PR.
