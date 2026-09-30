import { Json } from "../core/types";

export type ContentMedia =
  | { kind: "emoji"; value: string }
  | { kind: "image"; url: string; thumbUrl?: string; w?: number; h?: number; alt?: string }
  | { kind: "audio"; url: string };

export type ContentFact = { text: string; isTrue: boolean; explanation?: string; sourceUrl?: string };

/**
 * Engine-independent content. A movie item can feed Guess, Emoji Guess, Fact/Fake and Choice; each
 * engine decides how to turn it into a question.
 */
export type ContentItem = {
  id: string;
  type: string;
  schemaVersion: number;
  locale: string;
  categories: string[];
  tags: string[];
  /** 0 (easiest) .. 1 (hardest); editorial or measured. */
  difficulty: number;
  /** 0 (obscure) .. 1 (everyone knows it). */
  popularity: number;
  answer?: string;
  /** Accepted alternative answers (spelling, Hinglish, short forms). */
  aliases?: string[];
  /** Type-specific payload, e.g. { dialogue, cast, year } for movies. */
  attributes: Record<string, Json>;
  media?: ContentMedia[];
  facts?: ContentFact[];
  hints?: string[];
  /** Items sharing a group make harder (more similar) distractors for each other. */
  distractorGroup?: string;
  source?: { kind: "seed" | "cms" | "generated" | "fallback"; ref?: string };
  status: "draft" | "approved" | "retired";
  version: number;
};

/** What an engine asks for before a session starts. */
export type ContentQuery = {
  types: string[];
  categories?: string[];
  /** Minimum playable items; fewer means the session cannot start. */
  min: number;
};

export type ContentSource = "remote" | "cache" | "fallback" | "none";

export type ContentBundle = {
  items: ContentItem[];
  source: ContentSource;
  packIds: string[];
};

export const emptyBundle: ContentBundle = { items: [], source: "none", packIds: [] };
