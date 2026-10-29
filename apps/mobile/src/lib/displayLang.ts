import type { AppLang } from "../i18n/lang";

const DEVANAGARI = /[\u0900-\u097F]+/g;
const MULTI_SPACE = /\s{2,}/g;

/** True if the string contains Devanagari (Hindi script). */
export function hasDevanagari(text: string): boolean {
  DEVANAGARI.lastIndex = 0;
  return DEVANAGARI.test(text);
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
    cleaned = cleaned.replace(MULTI_SPACE, " ").trim();
    cleaned = cleaned.replace(/([?!])\s*[?!]+$/g, "$1").trim();
    return cleaned || raw;
  }

  let cleaned = raw.replace(DEVANAGARI, " ");
  cleaned = cleaned.replace(/\s*[|/·]+\s*/g, " ");
  cleaned = cleaned.replace(MULTI_SPACE, " ").trim();
  cleaned = cleaned.replace(/([?!])\s*[?!]+$/g, "$1").trim();
  return cleaned || raw;
}
