import type { FeedGame } from "../../api";
import { resolveGame } from "../core/resolve";
import { engineRegistry } from "../engines";
import { registerEngines } from "../engines/manifest";
import { LEGACY_REPLACEMENTS } from "../engines/replacements";
import { loadContent } from "./content";

const warmKeys = new Set<string>();
const inflight = new Map<string, Promise<void>>();

function warmKey(engine: string, variation: string): string {
  return `${engine}:${variation}`;
}

export function markEngineWarm(engine: string, variation: string) {
  warmKeys.add(warmKey(engine, variation));
}

/** True once engine JS + content packs for this engine/variation have been loaded this session. */
export function isEngineWarm(engine: string, variation: string): boolean {
  return warmKeys.has(warmKey(engine, variation));
}

export function isGameWarm(card: FeedGame): boolean {
  registerEngines();
  const resolved = resolveGame(card, {
    hasEngine: (id) => engineRegistry.has(id),
    replacements: LEGACY_REPLACEMENTS,
  });
  if (resolved.kind !== "sdk") return false;
  return isEngineWarm(resolved.definition.engine, resolved.definition.variation);
}

/**
 * Warm engine chunk + content packs while the intro card is on screen so Play feels instant.
 * Safe to call repeatedly; work is deduped per engine/variation.
 */
export function prefetchGame(card: FeedGame): void {
  registerEngines();
  const resolved = resolveGame(card, {
    hasEngine: (id) => engineRegistry.has(id),
    replacements: LEGACY_REPLACEMENTS,
  });
  if (resolved.kind !== "sdk") return;
  const def = resolved.definition;
  const key = warmKey(def.engine, def.variation);
  if (warmKeys.has(key) || inflight.has(key)) return;

  const run = (async () => {
    const mod = await engineRegistry.load(def.engine);
    const checked = mod.engine.checkDefinition(def);
    if (!checked.ok) return;
    const needs = mod.engine.contentNeeds(checked.value);
    if (needs.length) {
      await loadContent(needs, checked.value, { assetBudgetMs: 0 });
    }
    markEngineWarm(def.engine, def.variation);
  })()
    .catch((e) => {
      if (__DEV__) console.warn(`[game] prefetch ${card.key} failed`, e);
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, run);
}

/** Await an in-flight warm for this engine (no-op if already warm or never started). */
export async function awaitEnginePrefetch(engine: string, variation: string): Promise<void> {
  const key = warmKey(engine, variation);
  if (warmKeys.has(key)) return;
  const pending = inflight.get(key);
  if (pending) await pending;
}
