import type { AppLang } from "./lang";

const HI: Record<string, string> = {
  sports: "खेल",
  cricket: "क्रिकेट",
  news: "खबरें",
  "pop-culture": "पॉप कल्चर",
  food: "खाना",
  weather: "मौसम",
  tech: "टेक",
  music: "संगीत",
  movies: "फ़िल्में",
  social: "सोशल",
  casual: "कैज़ुअल",
  entertainment: "मनोरंजन",
  fashion: "फ़ैशन",
  politics: "राजनीति",
  science: "विज्ञान",
  health: "सेहत",
  "k-drama": "के-ड्रामा",
  travel: "यात्रा",
  "general-knowledge": "सामान्य ज्ञान",
  quiz: "क्विज़",
  poll: "पोल",
  game: "गेम",
};

export function categoryName(slug: string | undefined, fallback: string, lang: AppLang): string {
  if (lang !== "hi" || !slug) return fallback;
  return HI[slug] ?? fallback;
}
