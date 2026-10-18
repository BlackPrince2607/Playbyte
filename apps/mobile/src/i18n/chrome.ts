import type { AppLang } from "./lang";

const HI: Record<string, string> = {
  "Legendary run!": "शानदार खेल!",
  "Strong run!": "मज़बूत खेल!",
  "Flawless!": "बेदाग!",
  "Solid run.": "अच्छा खेल।",
  "Nice try.": "अच्छी कोशिश।",
  "Run complete.": "खेल पूरा।",
  "Correct answers": "सही जवाब",
  "Taking part": "हिस्सा लेना",
  "Crowd agreement": "भीड़ से सहमति",
  Speed: "गति",
  "Time left": "बचा समय",
  "Board cleared": "बोर्ड खाली",
  "Long words": "लंबे शब्द",
  Accuracy: "सटीकता",
  Gems: "रत्न",
  "Perfect fill": "पूरा भराव",
  Efficiency: "कुशलता",
  Streaks: "स्ट्रीक",
  Difficulty: "कठिनाई",
  Hints: "संकेत",
  Mistakes: "गलतियाँ",
  Hits: "लगे",
  Misses: "चूक",
  "Got away": "बच गए",
  "Best streak": "सबसे लंबी स्ट्रीक",
  "Best reaction": "सबसे तेज़ प्रतिक्रिया",
  "HOW YOU SCORED": "स्कोर कैसे बना",
};

export function localizeChrome(text: string, lang: AppLang): string {
  if (lang !== "hi") return text;
  return HI[text] ?? text;
}
