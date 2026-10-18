import type { AppLang } from "./lang";

export type ContentLocale = "en-IN" | "hi-IN";

let locale: ContentLocale = "en-IN";
const listeners = new Set<() => void>();

export function getContentLocale(): ContentLocale {
  return locale;
}

/** Hindi packs are requested as hi-IN and fall back to en-IN when that pack is missing. */
export function setContentLocale(lang: AppLang) {
  const next: ContentLocale = lang === "hi" ? "hi-IN" : "en-IN";
  if (next === locale) return;
  locale = next;
  listeners.forEach((listener) => listener());
}

export function onContentLocaleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
