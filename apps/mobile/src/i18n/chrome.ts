import type { AppLang } from "./lang";

/** Post-game chrome — spoken Hindi, keep score/streak/etc. as people say them. */
const HI: Record<string, string> = {
  "Legendary run!": "कमाल का रन!",
  "Strong run!": "शानदार रन!",
  "Flawless!": "परफेक्ट!",
  "Solid run.": "अच्छा खेला।",
  "Nice try.": "अच्छी कोशिश!",
  "Run complete.": "गेम पूरा।",
  "Correct answers": "सही जवाब",
  "Taking part": "पार्टिसिपेशन",
  "Crowd agreement": "भीड़ से मैच",
  Speed: "स्पीड",
  "Time left": "बचा टाइम",
  "Board cleared": "बोर्ड क्लियर",
  "Long words": "लंबे शब्द",
  Accuracy: "सटीकता",
  Gems: "जेम्स",
  "Perfect fill": "परफेक्ट फिल",
  Efficiency: "एफिशिएंसी",
  Streaks: "स्ट्रीक्स",
  Difficulty: "डिफिकल्टी",
  Hints: "हिंट्स",
  Mistakes: "मिस्टेक्स",
  Hits: "हिट्स",
  Misses: "मिसेस",
  "Got away": "बच गए",
  "Best streak": "बेस्ट स्ट्रीक",
  "Best reaction": "बेस्ट रिएक्शन",
  "Arrows cleared": "एरो क्लियर",
  "Blocked taps": "ब्लॉक्ड टैप्स",
  "Boards cleared": "बोर्ड क्लियर",
  "HOW YOU SCORED": "स्कोर कैसे बना",
  // Engine / moment chrome
  "Correct!": "सही!",
  "Not quite.": "लगभग — नहीं।",
  "Time's up!": "टाइम खत्म!",
  "Wait for green…": "ग्रीन का इंतज़ार…",
  "Too soon!": "जल्दी हो गया!",
  "Wait for green": "ग्रीन का इंतज़ार करो",
  "TAP!": "टैप!",
  "Tap now": "अभी टैप करो",
  "Wait for green, then tap": "ग्रीन आते ही टैप करो",
  "Swipe right for Fact, left for Fake": "फैक्ट के लिए दाएँ, फेक के लिए बाएँ स्वाइप",
  "✗ Fake": "✗ फेक",
  "✓ Fact": "✓ फैक्ट",
  "Lightning!": "बिजली!",
  "Quick!": "तेज़!",
  Nice: "नाइस",
  "Too slow!": "धीमे हो गए!",
  "Not yet…": "अभी नहीं…",
};

export function localizeChrome(text: string, lang: AppLang): string {
  if (lang !== "hi") return text;
  return HI[text] ?? text;
}
