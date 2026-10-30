import type { AppLang } from "./lang";

/** Everyday Hindi category names — keep common English words people actually say. */
const HI: Record<string, string> = {
  cricket: "क्रिकेट",
  movies: "बॉलीवुड",
  music: "म्यूज़िक",
  "pop-culture": "मीम्स और पॉप कल्चर",
  food: "फ़ूड",
  gaming: "गेमिंग",
  sports: "स्पोर्ट्स (बिना क्रिकेट)",
  news: "न्यूज़ और करेंट अफेयर्स",
  tech: "टेक्नोलॉजी",
  "personality-vibe": "पर्सनैलिटी और क्विज़",
  fashion: "फ़ैशन और ब्यूटी",
  health: "हेल्थ और फिटनेस",
  kpop: "के-पॉप और के-ड्रामा",
  puzzles: "पज़ल्स",
  "logical-reasoning": "लॉजिकल रीज़निंग",
  "math-numbers": "मैथ और नंबर्स",
  // Legacy slugs (inactive / remapped)
  weather: "मौसम",
  casual: "कैज़ुअल",
  entertainment: "एंटरटेनमेंट",
  politics: "पॉलिटिक्स",
  science: "साइंस",
  social: "सोशल",
  "k-drama": "के-ड्रामा",
  quiz: "क्विज़",
  poll: "पोल",
  game: "गेम",
};

export function categoryName(slug: string | undefined, fallback: string, lang: AppLang): string {
  if (lang !== "hi" || !slug) return fallback;
  return HI[slug] ?? fallback;
}
