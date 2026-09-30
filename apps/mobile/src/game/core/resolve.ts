import { GameDefinition, parseDefinition } from "./definition";

/** Shape of a game card as delivered by the feed / catalog API. */
export type GameCard = {
  key: string;
  title: string;
  blurb: string;
  engine?: string;
  variation?: string;
  config?: Record<string, unknown>;
};

export type ResolvedGame =
  | { kind: "sdk"; key: string; title: string; blurb: string; definition: GameDefinition }
  | { kind: "unavailable"; key: string; title: string; reason: string };

export type ResolveDeps = {
  hasEngine(id: string): boolean;
  /** Retired legacy keys mapped to the SDK definition that replaced them. */
  replacements: Record<string, Record<string, unknown>>;
};

/** Decides how a card is played. Pure: no loading happens here. */
export function resolveGame(card: GameCard, deps: ResolveDeps): ResolvedGame {
  const config = card.config ?? {};
  const engine = card.engine ?? (typeof config.engine === "string" ? config.engine : undefined);

  const toSdk = (raw: Record<string, unknown>): ResolvedGame => {
    const parsed = parseDefinition(raw);
    if (!parsed.ok) return { kind: "unavailable", key: card.key, title: card.title, reason: parsed.error };
    return { kind: "sdk", key: card.key, title: card.title, blurb: card.blurb, definition: parsed.value };
  };

  if (engine) {
    if (!deps.hasEngine(engine)) {
      return { kind: "unavailable", key: card.key, title: card.title, reason: `Engine not in this app version: ${engine}` };
    }
    return toSdk({ ...config, engine, variation: card.variation ?? config.variation });
  }

  const replacement = deps.replacements[card.key];
  if (replacement && typeof replacement.engine === "string" && deps.hasEngine(replacement.engine)) {
    return toSdk(replacement);
  }

  return { kind: "unavailable", key: card.key, title: card.title, reason: `Unknown game: ${card.key}` };
}
