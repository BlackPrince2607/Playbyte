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
