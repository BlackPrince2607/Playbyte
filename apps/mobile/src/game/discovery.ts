import { resolveGame, type GameCard } from "./core/resolve";
import { engineRegistry } from "./engines";
import { registerEngines } from "./engines/manifest";
import { LEGACY_REPLACEMENTS } from "./engines/replacements";

/** True when this app build has an engine that can play the card. */
export function isPlayable(card: GameCard): boolean {
  registerEngines();
  return (
    resolveGame(card, {
      hasEngine: (id) => engineRegistry.has(id),
      replacements: LEGACY_REPLACEMENTS,
    }).kind !== "unavailable"
  );
}

/** The game after `key` in feed order, wrapping around; null when there is no other game. */
export function nextGame<G extends { key: string }>(games: readonly G[], key: string): G | null {
  const others = games.filter((g) => g.key !== key);
  if (!others.length) return null;
  const at = games.findIndex((g) => g.key === key);
  if (at < 0) return others[0];
  for (let i = 1; i <= games.length; i++) {
    const g = games[(at + i) % games.length];
    if (g.key !== key) return g;
  }
  return others[0];
}
