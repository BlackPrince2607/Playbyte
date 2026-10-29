import type { AppLang } from "./lang";

/** Everyday Hindi category names — keep common English words people actually say. */
const HI: Record<string, string> = {
  sports: "स्पोर्ट्स",
  cricket: "क्रिकेट",
  news: "न्यूज़",
  "pop-culture": "पॉप कल्चर",
  food: "फ़ूड",
  weather: "मौसम",
  tech: "टेक",
  music: "म्यूज़िक",
  movies: "मूवीज़",
  social: "सोशल",
  casual: "कैज़ुअल",
  entertainment: "एंटरटेनमेंट",
  fashion: "फ़ैशन",
  politics: "पॉलिटिक्स",
  science: "साइंस",
  health: "हेल्थ",
  "k-drama": "के-ड्रामा",
  "personality-vibe": "पर्सनैलिटी और वाइब",
  kpop: "के-पॉप",
  travel: "ट्रैवल",
  "general-knowledge": "जनरल नॉलेज",
  quiz: "क्विज़",
  poll: "पोल",
  game: "गेम",
};

export function categoryName(slug: string | undefined, fallback: string, lang: AppLang): string {
  if (lang !== "hi" || !slug) return fallback;
  return HI[slug] ?? fallback;
}
