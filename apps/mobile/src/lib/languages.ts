export type AppLanguage = {
  id: string;
  name: string;
  glyph: string;
  greeting: string;
  tag: string;
};

export const APP_LANGUAGES: readonly AppLanguage[] = [
  { id: "en", name: "English", glyph: "Aa", greeting: "Hello & Welcome", tag: "Global" },
  { id: "hi", name: "हिंदी", glyph: "अ", greeting: "नमस्ते! स्वागत है", tag: "Popular" },
];

export const UPCOMING_LANGUAGES = ["Hinglish", "தமிழ்", "తెలుగు", "ಕನ್ನಡ", "मराठी"];

export function languageName(id: string): string {
  return APP_LANGUAGES.find((l) => l.id === id)?.name ?? APP_LANGUAGES[0].name;
}

/** Older builds stored languages that are no longer offered; treat those as English. */
export function supportedLanguage(id: string): string {
  return APP_LANGUAGES.some((l) => l.id === id) ? id : APP_LANGUAGES[0].id;
}
