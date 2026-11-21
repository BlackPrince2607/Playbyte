import type { AppLang } from "./lang";

/** Everyday Hindi category names — keep common English words people actually say. */
const HI: Record<string, string> = {
  bollywood: "बॉलीवुड",
  mythology: "माइथोलॉजी",
  "tv-serials": "टीवी सीरियल्स",
  cricket: "क्रिकेट",
  "indian-foods": "इंडियन फ़ूड",
  football: "फ़ुटबॉल",
  "general-knowledge": "जनरल नॉलेज",
  kpop: "के-पॉप",
  "boys-girls": "बॉयज़ एंड गर्ल्स",
  "math-puzzles": "मैथ पज़ल्स",
  "memory-games": "मेमोरी गेम्स",
  "word-puzzles": "वर्ड पज़ल्स",
  maths: "मैथ्स",
  // Legacy / remapped slugs
  movies: "बॉलीवुड",
  music: "म्यूज़िक",
  "pop-culture": "मीम्स और पॉप कल्चर",
  food: "फ़ूड",
  gaming: "गेमिंग",
  sports: "फ़ुटबॉल",
  news: "न्यूज़ और करेंट अफेयर्स",
  tech: "टेक्नोलॉजी",
  "personality-vibe": "बॉयज़ एंड गर्ल्स",
  fashion: "फ़ैशन और ब्यूटी",
  health: "हेल्थ और फिटनेस",
  puzzles: "पज़ल्स",
  "logical-reasoning": "लॉजिकल रीज़निंग",
  "math-numbers": "मैथ और नंबर्स",
  weather: "मौसम",
  casual: "कैज़ुअल",
  entertainment: "एंटरटेनमेंट",
  politics: "पॉलिटिक्स",
  science: "साइंस",
  social: "सोशल",
  "k-drama": "के-ड्रामा",
  trivia: "ट्रिविया",
  quiz: "क्विज़",
  poll: "पोल",
  game: "गेम",
};

export function categoryName(slug: string | undefined, fallback: string, lang: AppLang): string {
  if (lang !== "hi" || !slug) return fallback;
  return HI[slug] ?? fallback;
}
