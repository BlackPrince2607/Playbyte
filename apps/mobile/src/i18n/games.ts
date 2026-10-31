import type { AppLang } from "./lang";

type Copy = { title: string; blurb: string };

/** Spoken Hindi game chrome — keep quiz/poll/game/score loanwords. */
const HI: Record<string, Copy> = {
  higher_or_lower: { title: "ज़्यादा या कम", blurb: "अगला नंबर ज़्यादा होगा या कम? जब चाहो खत्म करो।" },
  memory_sequence: { title: "मेमोरी सीक्वेंस", blurb: "सीक्वेंस देखो और वही टैप करो।" },
  traffic_light: { title: "ट्रैफ़िक लाइट", blurb: "हरा होते ही टैप करो।" },
  timer_stop: { title: "टाइमर रोको", blurb: "घड़ी को 9.999 सेकंड के जितना पास रोक सको।" },
  color_match: { title: "कलर मैच", blurb: "क्या शब्द स्याही के रंग से मैच करता है?" },
  frenzy_tap: { title: "फ़्रेंज़ी टैप", blurb: "जितना चाहो टैप करो — तैयार हो तो खत्म करो।" },
  odd_one_out: { title: "अलग वाला", blurb: "वो शेप ढूँढो जो बाकी से अलग है।" },
  perfect_circle: { title: "परफेक्ट सर्कल", blurb: "जितना गोल सर्कल बना सको, बनाओ।" },
  bubble_burst: { title: "बबल बर्स्ट", blurb: "मिलते बबल्स फोड़ो। जब चाहो खत्म करो।" },
  lane_dash: { title: "लेन डैश", blurb: "तीन लेन में रुकावटों से बचो। टकराए तो फिर कोशिश।" },
  triple_match: { title: "ट्रिपल मैच", blurb: "तीन मिलती टाइलें चुनो। जब चाहो खत्म करो।" },
  flag_rush: { title: "फ्लैग रश", blurb: "झंडे पहचानो — 10 सवाल, फिर खत्म।" },
  emoji_decode: { title: "इमोजी डिकोड", blurb: "इमोजी पहेलियाँ सुलझाओ — 5 राउंड, फिर खत्म।" },
  word_scramble: { title: "वर्ड स्क्रैंबल", blurb: "उलझे शब्द सुलझाते रहो। जब चाहो खत्म करो।" },
  word_blitz: { title: "वर्ड ब्लिट्ज़", blurb: "छह कोशिशों में पाँच अक्षरों का शब्द बताओ।" },
  grid_hunt: { title: "ग्रिड हंट", blurb: "अक्षरों की ग्रिड में छिपे शब्द ढूँढो।" },
  guess_flag: { title: "फ्लैग गेस", blurb: "झंडे से देश का नाम बताओ। 10 राउंड, धीरे-धीरे मुश्किल।" },
  guess_indian_state: { title: "स्टेट गेस", blurb: "हिंट पर हिंट — ये कौन सा भारतीय स्टेट है?" },
  guess_food: { title: "फ़ूड गेस", blurb: "इमोजी और हिंट्स से डिश का नाम बताओ।" },
  guess_landmark: { title: "लैंडमार्क गेस", blurb: "ताज से एफिल टॉवर तक — हिंट्स से नाम बताओ।" },
  emoji_movie: { title: "इमोजी मूवीज़", blurb: "बॉलीवुड और हॉलीवुड की फ़िल्में, इमोजी में।" },
  emoji_bollywood: { title: "इमोजी बॉलीवुड", blurb: "क्या तुम ये बॉलीवुड फ़िल्में पहचान सकते हो?" },
  emoji_phrase: { title: "इमोजी फ्रेज़ेस", blurb: "इमोजी में छिपे मुहावरे और कहावतें।" },
  emoji_word: { title: "इमोजी वर्ड", blurb: "दो इमोजी, एक शब्द। जोड़ समझो।" },
  odd_words: { title: "अलग शब्द", blurb: "चार शब्द, एक अजनबी। जल्दी ढूँढो।" },
  odd_emoji: { title: "अलग इमोजी", blurb: "कौन सी तस्वीर यहाँ की नहीं है?" },
  odd_numbers: { title: "अलग नंबर", blurb: "वो नंबर ढूँढो जो पैटर्न तोड़ता है।" },
  odd_lookalike: { title: "मिलती इमोजी", blurb: "एक टाइल थोड़ी अलग है। दिखी?" },
  tap_rush: { title: "टारगेट रश", blurb: "तीन 12-सेकंड के राउंड। टारगेट गायब होने से पहले टैप करो।" },
  tap_moles: { title: "व्हैक-अ-मोल", blurb: "मोल निकलते ही दबाओ। स्टार्स दोगुने पॉइंट्स के हैं।" },
  tap_reaction: { title: "रिएक्शन टाइम", blurb: "ग्रीन का इंतज़ार करो, फिर टैप। पाँच कोशिशें।" },
  word_search: { title: "वर्ड सर्च", blurb: "तीन थीम वाली ग्रिड। छिपे शब्दों पर उंगली घुमाओ।" },
  word_search_india: { title: "देसी वर्ड सर्च", blurb: "भारत के शहर, नदियाँ, मिठाइयाँ और मसाले।" },
  word_search_blitz: { title: "वर्ड सर्च ब्लिट्ज़", blurb: "टाइमर के खिलाफ पाँच तेज़ ग्रिड।" },
  word_search_mystery: { title: "मिस्ट्री वर्ड", blurb: "थीम और लेंथ दी गई है। शब्द ढूँढो।" },
  spot_shapes: { title: "फर्क ढूँढो", blurb: "दो नियॉन तस्वीरें, कुछ बदलाव। सब ढूँढो।" },
  spot_city: { title: "ढूँढो: नाइट सिटी", blurb: "खिड़कियाँ, टावर और चाँद। क्या बदला?" },
  spot_garden: { title: "ढूँढो: गार्डन", blurb: "फूल, बादल और तितलियाँ — कुछ चुपके बदलाव।" },
  spot_space: { title: "ढूँढो: स्पेस", blurb: "ग्रह, तारे और एक रॉकेट। ध्यान से तुलना करो।" },
  fact_fake: { title: "फैक्ट या फेक", blurb: "सच के लिए दाएँ, झूठ के लिए बाएँ। दस बातें।" },
  fact_fake_india: { title: "फैक्ट या फेक: भारत", blurb: "हिस्ट्री, जगहें और कल्चर। सच पहचानोगे?" },
  fact_fake_science: { title: "फैक्ट या फेक: साइंस", blurb: "स्पेस, जानवर और बॉडी। मिथ से बचो।" },
  fact_fake_sports: { title: "फैक्ट या फेक: स्पोर्ट्स", blurb: "क्रिकेट, ओलंपिक और भी बहुत कुछ।" },
  fact_fake_filmy: { title: "फैक्ट या फेक: फ़िल्मी", blurb: "फ़िल्म और म्यूज़िक ट्रिविया — सच या पूरी तरह फेक।" },
  this_or_that: { title: "यह या वह", blurb: "एक साइड चुनो, फिर देखो भीड़ कहाँ खड़ी है।" },
  food_fight: { title: "फ़ूड फाइट", blurb: "चाय या कॉफ़ी? बिरयानी या पुलाव? सोचकर चुनो।" },
  desi_debates: { title: "देसी डिबेट्स", blurb: "भारत की बड़ी या-या डिबेट्स।" },
  read_the_crowd: { title: "भीड़ पढ़ो", blurb: "अंदाज़ा लगाओ ज़्यादातर प्लेयर्स ने क्या चुना। जितना करीब बँटवारा, उतना मुश्किल।" },
  tap_dont_tap: { title: "ग्रीन लाइट, रेड लाइट", blurb: "हरे पर टैप, लाल छोड़ो। फिर रूल पलटते हैं। तीन लाइव्स।" },
  fruit_frenzy: { title: "फ्रूट फ्रेंज़ी", blurb: "फल टैप करो, जंक कभी नहीं। तीन लाइव्स।" },
  balloon_pop: { title: "बैलून पॉप", blurb: "बैलून्स फोड़ो, बॉम्ब्स से बचो। तीन लाइव्स।" },
  maze_runner: { title: "मेज़ रनर", blurb: "तीन मेज़, और बड़ी होती जाएँ। जल्दी एग्ज़िट ढूँढो।" },
  maze_gems: { title: "जेम हंट", blurb: "हर जेम उठाओ, तभी एग्ज़िट खुलेगा।" },
  maze_fog: { title: "फॉग मेज़", blurb: "एक मेज़, जिसमें कुछ ही स्टेप्स दिखते हैं।" },
  maze_sprint: { title: "मेज़ स्प्रिंट", blurb: "छोटे टाइमर पर पाँच तेज़ मेज़।" },
  connect_dots: { title: "डॉट्स कनेक्ट", blurb: "हर जोड़ी बिना काटे जोड़ो। बोर्ड भरने पर बोनस।" },
  connect_blitz: { title: "कनेक्ट ब्लिट्ज़", blurb: "पाँच छोटे बोर्ड, छोटा टाइमर।" },
  connect_xl: { title: "कनेक्ट XL", blurb: "धैर्य वाले दिमाग के लिए दो बड़े बोर्ड।" },
  arrow_rush: { title: "एरो रश", blurb: "साफ रास्ता वाले एरो टैप करो। हर बोर्ड पर 10 सेकंड — रुका एरो एक सेकंड काटता है।" },
  arrow_rush_25: { title: "एरो रश+", blurb: "वही एरो पज़ल, हर बोर्ड पर 12 सेकंड।" },
  math_rush: { title: "मैथ रश", blurb: "सवाल हल करो, जल्दी टैप करो। जितना सही, उतना मुश्किल।" },
  math_check: { title: "ट्रू या ट्रैप", blurb: "समीकरण सही है या गलत? फटाफट तय करो।" },
  math_blitz: { title: "मैथ ब्लिट्ज़", blurb: "पंद्रह तेज़ सवाल। तीन लाइव्स। कोई माफी नहीं।" },
};

const HI_TAGS: Record<string, string> = {
  PUZZLE: "पज़ल",
  ARCADE: "आर्केड",
  TRIVIA: "ट्रिविया",
  WORD: "वर्ड",
  GAME: "गेम",
  FOOD: "फ़ूड",
  MOVIES: "मूवीज़",
  SOCIAL: "सोशल",
  SPORTS: "स्पोर्ट्स",
  MUSIC: "म्यूज़िक",
  QUIZ: "क्विज़",
  POLL: "पोल",
};

type GameLike = {
  key: string;
  title: string;
  blurb: string;
  config?: Record<string, unknown> | null;
};

export function localizeGame<T extends GameLike>(game: T, lang: AppLang): T {
  if (lang !== "hi") return game;
  const copy = HI[game.key];
  const rawTag = game.config?.tag ?? game.config?.genre;
  const tag = typeof rawTag === "string" ? rawTag.toUpperCase() : "";
  const hiTag = tag ? HI_TAGS[tag] : undefined;
  if (!copy && !hiTag) return game;
  const config = game.config ? { ...game.config, ...(hiTag ? { tag: hiTag } : {}) } : game.config;
  return {
    ...game,
    title: copy?.title ?? game.title,
    blurb: copy?.blurb ?? game.blurb,
    config,
  };
}
