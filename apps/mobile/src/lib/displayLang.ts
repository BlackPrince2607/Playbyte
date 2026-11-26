import type { AppLang } from "../i18n/lang";

const DEVANAGARI = /[\u0900-\u097F]/;
const DEVANAGARI_G = /[\u0900-\u097F]+/g;
/** Arabic / Urdu script — never in English or Hindi UI copy (per EN/HI generation prompts). */
const ARABIC_G = /[\u0600-\u06FF]+/g;
const MULTI_SPACE = /\s{2,}/g;
const HAS_LATIN = /[A-Za-z0-9]/;

/** True if the string contains Devanagari (Hindi script). */
export function hasDevanagari(text: string): boolean {
  return DEVANAGARI.test(text);
}

function tidy(cleaned: string): string {
  return cleaned.replace(MULTI_SPACE, " ").trim().replace(/([?!])\s*[?!]+$/g, "$1").trim();
}

/**
 * Keep poll/quiz copy in the selected language only — never fall back to the other script.
 *
 * Matches the English / Hindi Content Generation Agent prompts:
 * - en: natural Latin English only; no Devanagari, no Arabic/Urdu.
 * - hi: Devanagari Hindi/Hinglish; strip Arabic/Urdu and Latin bilingual halves;
 *   short Latin brands may remain inside Devanagari text, but Latin-only copy is dropped.
 */
export function displayCopy(text: string | null | undefined, lang: AppLang): string {
  const raw = (text ?? "").trim();
  if (!raw) return "";

  if (lang === "hi") {
    let cleaned = raw.replace(ARABIC_G, " ");
    if (!hasDevanagari(cleaned)) {
      // No Devanagari left → wrong language for Hindi UI (do not show English/Latin-only).
      return "";
    }
    // Drop Latin-only bilingual halves like "Excited! / एक्साइटेड".
    cleaned = cleaned.replace(/\s*[|/·]+\s*/g, " ");
    cleaned = cleaned.replace(/(?:^|\s)[A-Za-z][A-Za-z0-9''!?.%&-]{0,40}(?=\s|$)/g, " ");
    cleaned = tidy(cleaned);
    return hasDevanagari(cleaned) ? cleaned : "";
  }

  let cleaned = raw.replace(DEVANAGARI_G, " ").replace(ARABIC_G, " ");
  cleaned = cleaned.replace(/\s*[|/·]+\s*/g, " ");
  cleaned = tidy(cleaned);
  // Pure Hindi (or empty after strip) must not leak into English UI.
  return cleaned && HAS_LATIN.test(cleaned) ? cleaned : "";
}
