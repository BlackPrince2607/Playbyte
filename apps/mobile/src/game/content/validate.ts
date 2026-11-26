/**
 * Content validation pipeline, run on every pack the client loads (the server runs the same rules
 * on ingest). Generated / AI-produced content goes through exactly the same checks.
 */
import { Result, err, ok } from "../core/types";
import { ContentFact, ContentItem, ContentMedia } from "./types";

const ID_RE = /^[a-z0-9][a-z0-9_.:-]{0,79}$/;
const TYPE_RE = /^[a-z][a-z0-9_]{1,39}$/;
const DEVANAGARI = /[\u0900-\u097F]/;
const ARABIC = /[\u0600-\u06FF]/;
/** Attribute / nested keys that hold visible player copy (not ids, URLs, coords). */
const COPY_KEYS = new Set(["answer", "hints", "members", "distractors", "prompt", "label", "title", "text", "explanation"]);

/** Terms that must never appear in player-facing game content. Kept short; the server list is authoritative. */
const BLOCKLIST = ["fuck", "shit", "bitch", "rape", "nazi", "porn", "slut", "chutiya", "madarchod", "behenchod"];

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const strArr = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");
const unit = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Player-facing copy checked for locale script purity (EN vs HI packs). */
function playerFacingCopy(raw: Record<string, unknown>, attributes: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v);
  };
  push(raw.answer);
  if (Array.isArray(raw.hints)) for (const h of raw.hints) push(h);
  if (Array.isArray(raw.facts)) {
    for (const f of raw.facts) {
      if (isObj(f)) push(f.text);
    }
  }
  const walk = (v: unknown, key?: string) => {
    if (typeof v === "string") {
      if (key && COPY_KEYS.has(key)) push(v);
      return;
    }
    if (Array.isArray(v)) {
      // members / distractors / hints arrays inherit the parent key.
      for (const x of v) {
        if (typeof x === "string" && key && COPY_KEYS.has(key)) push(x);
        else walk(x);
      }
      return;
    }
    if (isObj(v)) {
      for (const [k, x] of Object.entries(v)) walk(x, k);
    }
  };
  walk(attributes);
  return out;
}

function localeScriptError(locale: string, texts: string[]): string | null {
  const hi = locale.toLowerCase().startsWith("hi");
  for (const t of texts) {
    if (ARABIC.test(t)) return "arabic script in copy";
    if (hi) {
      if (!DEVANAGARI.test(t)) return "hi-IN copy missing Devanagari";
    } else if (DEVANAGARI.test(t)) {
      return "en-IN copy contains Devanagari";
    }
  }
  return null;
}

export function containsBlocked(text: string): boolean {
  const t = text.toLowerCase();
  return BLOCKLIST.some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(t));
}

function textsOf(x: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 4) return out;
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) for (const v of x) textsOf(v, out, depth + 1);
  else if (isObj(x)) for (const v of Object.values(x)) textsOf(v, out, depth + 1);
  return out;
}

function checkMedia(m: unknown): string | null {
  if (!isObj(m)) return "media entry not an object";
  if (m.kind === "emoji") return typeof m.value === "string" && m.value.length > 0 && m.value.length <= 64 ? null : "emoji value";
  if (m.kind === "image" || m.kind === "audio") {
    // https CDN, or bundled spot-the-difference flat art (`asset:spot/<key>`).
    if (typeof m.url !== "string" || !(/^(https:\/\/|asset:spot\/)/.test(m.url))) {
      return "media url must be https or asset:spot/";
    }
    if (m.kind === "audio" && m.url.startsWith("asset:spot/")) return "audio cannot use asset:spot/";
    return null;
  }
  return `unknown media kind ${String(m.kind)}`;
}

function checkFact(f: unknown): string | null {
  if (!isObj(f)) return "fact not an object";
  if (typeof f.text !== "string" || f.text.length < 5 || f.text.length > 280) return "fact text length";
  if (typeof f.isTrue !== "boolean") return "fact isTrue";
  return null;
}

/** Validates and normalises one item. */
export function validateItem(raw: unknown): Result<ContentItem> {
  if (!isObj(raw)) return err("item: not an object");
  const id = raw.id;
  if (typeof id !== "string" || !ID_RE.test(id)) return err(`item: bad id ${String(id)}`);
  const at = (msg: string) => err<ContentItem>(`${id}: ${msg}`);
  if (typeof raw.type !== "string" || !TYPE_RE.test(raw.type)) return at("bad type");
  if (raw.categories !== undefined && !strArr(raw.categories)) return at("categories must be strings");
  if (raw.tags !== undefined && !strArr(raw.tags)) return at("tags must be strings");
  if (raw.aliases !== undefined && !strArr(raw.aliases)) return at("aliases must be strings");
  if (raw.hints !== undefined && !strArr(raw.hints)) return at("hints must be strings");
  const difficulty = raw.difficulty ?? 0.5;
  const popularity = raw.popularity ?? 0.5;
  if (!unit(difficulty)) return at("difficulty must be 0..1");
  if (!unit(popularity)) return at("popularity must be 0..1");
  if (raw.answer !== undefined && (typeof raw.answer !== "string" || !raw.answer.trim())) return at("empty answer");
  if (raw.attributes !== undefined && !isObj(raw.attributes)) return at("attributes must be an object");
  const status = raw.status ?? "approved";
  if (status !== "draft" && status !== "approved" && status !== "retired") return at("bad status");

  const media = raw.media ?? [];
  if (!Array.isArray(media) || media.length > 8) return at("media must be an array (max 8)");
  for (const m of media) {
    const e = checkMedia(m);
    if (e) return at(e);
  }
  const facts = raw.facts ?? [];
  if (!Array.isArray(facts) || facts.length > 12) return at("facts must be an array (max 12)");
  for (const f of facts) {
    const e = checkFact(f);
    if (e) return at(e);
  }

  const attributes = (raw.attributes ?? {}) as ContentItem["attributes"];
  // Answer check: the answer must not also be offered as a distractor.
  const answer = typeof raw.answer === "string" ? raw.answer.trim() : undefined;
  const distractors = attributes.distractors;
  if (answer && Array.isArray(distractors)) {
    const a = norm(answer);
    const aliases = ((raw.aliases as string[] | undefined) ?? []).map(norm);
    if (distractors.some((d) => typeof d === "string" && (norm(d) === a || aliases.includes(norm(d))))) {
      return at("answer appears among distractors");
    }
  }

  if (textsOf([raw.answer, raw.aliases, raw.hints, facts, attributes]).some(containsBlocked)) return at("blocked term");

  const locale = typeof raw.locale === "string" ? raw.locale : "en-IN";
  const scriptErr = localeScriptError(locale, playerFacingCopy(raw, attributes as Record<string, unknown>));
  if (scriptErr) return at(scriptErr);

  return ok({
    id,
    type: raw.type,
    schemaVersion: typeof raw.schemaVersion === "number" ? raw.schemaVersion : 1,
    locale,
    categories: (raw.categories as string[] | undefined) ?? [],
    tags: (raw.tags as string[] | undefined) ?? [],
    difficulty: difficulty as number,
    popularity: popularity as number,
    answer,
    aliases: raw.aliases as string[] | undefined,
    attributes,
    media: media as ContentMedia[],
    facts: facts as ContentFact[],
    hints: raw.hints as string[] | undefined,
    distractorGroup: typeof raw.distractorGroup === "string" ? raw.distractorGroup : undefined,
    source: isObj(raw.source) ? (raw.source as ContentItem["source"]) : undefined,
    status,
    version: typeof raw.version === "number" ? raw.version : 1,
  });
}

export type PackValidation = { items: ContentItem[]; rejected: { id?: string; error: string }[] };

/** Validates a pack; bad items are dropped (and reported), duplicates keep the first occurrence. */
export function validatePack(rawItems: unknown): PackValidation {
  const out: PackValidation = { items: [], rejected: [] };
  if (!Array.isArray(rawItems)) {
    out.rejected.push({ error: "pack items not an array" });
    return out;
  }
  const seen = new Set<string>();
  for (const raw of rawItems) {
    const r = validateItem(raw);
    if (!r.ok) {
      out.rejected.push({ id: isObj(raw) && typeof raw.id === "string" ? raw.id : undefined, error: r.error });
      continue;
    }
    if (seen.has(r.value.id)) {
      out.rejected.push({ id: r.value.id, error: "duplicate id" });
      continue;
    }
    seen.add(r.value.id);
    if (r.value.status === "approved") out.items.push(r.value);
  }
  return out;
}
