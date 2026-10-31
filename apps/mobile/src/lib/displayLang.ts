import type { AppLang } from "../i18n/lang";

const DEVANAGARI = /[\u0900-\u097F]+/g;
const MULTI_SPACE = /\s{2,}/g;
/** Latin or Devanagari letters/digits — detects punctuation-only leftovers after stripping. */
const HAS_WORD = /[A-Za-z0-9\u0900-\u097F]/;

/** True if the string contains Devanagari (Hindi script). */
export function hasDevanagari(text: string): boolean {
  DEVANAGARI.lastIndex = 0;
  return DEVANAGARI.test(text);
}

function finalize(cleaned: string, raw: string): string {
  const next = cleaned.replace(MULTI_SPACE, " ").trim().replace(/([?!])\s*[?!]+$/g, "$1").trim();
  // Prefer the original over ", ?" / "!" leftovers when a script strip removed every word.
  if (!next || !HAS_WORD.test(next)) return raw;
  return next;
}

/**
 * Keep poll/quiz copy in the selected language only.
 * English mode drops Devanagari that leaked into the English field.
 * Hindi mode keeps Devanagari; Latin-only strings stay as a fallback.
 */
export function displayCopy(text: string | null | undefined, lang: AppLang): string {
  const raw = (text ?? "").trim();
  if (!raw) return "";

  if (lang === "hi") {
    if (!hasDevanagari(raw)) return raw;
    // Drop Latin-only bilingual halves like "Excited! / एक्साइटेड".
    let cleaned = raw.replace(/\s*[|/·]+\s*/g, " ");
    cleaned = cleaned.replace(/(?:^|\s)[A-Za-z][A-Za-z0-9''!?.%&-]{0,40}(?=\s|$)/g, " ");
    return finalize(cleaned, raw);
  }

  let cleaned = raw.replace(DEVANAGARI, " ");
  cleaned = cleaned.replace(/\s*[|/·]+\s*/g, " ");
  return finalize(cleaned, raw);
}
