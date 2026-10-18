import type { AppLang } from "./lang";

type Copy = { title: string; blurb: string };

const HI: Record<string, Copy> = {
  higher_or_lower: { title: "ज़्यादा या कम", blurb: "अगला नंबर ज़्यादा होगा या कम? जब चाहें समाप्त करें।" },
  memory_sequence: { title: "याद रखने का क्रम", blurb: "क्रम देखें और वही टैप करें।" },
  traffic_light: { title: "ट्रैफ़िक लाइट", blurb: "हरा होते ही टैप करें।" },
  timer_stop: { title: "टाइमर रोकें", blurb: "घड़ी को 9.999 सेकंड के जितना पास रोक सकें।" },
  color_match: { title: "रंग मिलाएं", blurb: "क्या शब्द स्याही के रंग से मेल खाता है?" },
  frenzy_tap: { title: "तेज़ टैप", blurb: "जितना चाहें टैप करें — तैयार हों तो समाप्त करें।" },
  odd_one_out: { title: "बेमेल आकृति", blurb: "वह आकृति खोजें जो बाकी से अलग हो।" },
  perfect_circle: { title: "परफेक्ट सर्कल", blurb: "जितना गोल घेरा बना सकें, बनाएं।" },
  bubble_burst: { title: "बबल बर्स्ट", blurb: "मिलते बबल्स फोड़ें। जब चाहें समाप्त करें।" },
  lane_dash: { title: "लेन डैश", blurb: "तीन लेन में रुकावटों से बचें। टकराएं तो फिर कोशिश करें।" },
  triple_match: { title: "ट्रिपल मैच", blurb: "तीन मिलती टाइलें चुनें। जब चाहें समाप्त करें।" },
  flag_rush: { title: "फ्लैग रश", blurb: "झंडे पहचानें — 10 सवाल, फिर खत्म।" },
  emoji_decode: { title: "इमोजी डिकोड", blurb: "इमोजी पहेलियाँ सुलझाएं — 5 राउंड, फिर खत्म।" },
  word_scramble: { title: "शब्द सुलझाएं", blurb: "उलझे शब्द सुलझाते रहें। जब चाहें समाप्त करें।" },
  word_blitz: { title: "वर्ड ब्लिट्ज़", blurb: "छह कोशिशों में पाँच अक्षरों का शब्द बताएं।" },
  grid_hunt: { title: "ग्रिड हंट", blurb: "अक्षरों की ग्रिड में छिपे शब्द खोजें।" },
  guess_flag: { title: "झंडा पहचानें", blurb: "झंडे से देश का नाम बताएं। 10 राउंड, धीरे-धीरे मुश्किल।" },
  guess_indian_state: { title: "राज्य पहचानें", blurb: "संकेत पर संकेत — यह कौन सा भारतीय राज्य है?" },
  guess_food: { title: "व्यंजन पहचानें", blurb: "इमोजी और संकेतों से पकवान का नाम बताएं।" },
  guess_landmark: { title: "इमारत पहचानें", blurb: "ताज से एफिल टॉवर तक — संकेतों से नाम बताएं।" },
  emoji_movie: { title: "इमोजी फ़िल्में", blurb: "बॉलीवुड और हॉलीवुड की फ़िल्में, इमोजी में।" },
  emoji_bollywood: { title: "इमोजी में बॉलीवुड", blurb: "क्या आप ये बॉलीवुड फ़िल्में पहचान सकते हैं?" },
  emoji_phrase: { title: "इमोजी मुहावरे", blurb: "इमोजी में छिपे मुहावरे और कहावतें।" },
  emoji_word: { title: "इमोजी शब्द", blurb: "दो इमोजी, एक शब्द। जोड़ समझें।" },
  odd_words: { title: "बेमेल शब्द", blurb: "चार शब्द, एक अजनबी। जल्दी खोजें।" },
  odd_emoji: { title: "बेमेल इमोजी", blurb: "कौन सी तस्वीर यहाँ की नहीं है?" },
  odd_numbers: { title: "बेमेल संख्या", blurb: "वह संख्या खोजें जो पैटर्न तोड़ती है।" },
  odd_lookalike: { title: "मिलती इमोजी", blurb: "एक टाइल थोड़ी अलग है। क्या दिखी?" },
  tap_rush: { title: "टारगेट रश", blurb: "तीन 12-सेकंड के राउंड। निशाने गायब होने से पहले टैप करें।" },
  tap_moles: { title: "व्हैक-अ-मोल", blurb: "छछूंदरों को निकलते ही दबाएं। सितारे दोगुने अंक के हैं।" },
  tap_reaction: { title: "रिएक्शन टाइम", blurb: "हरे होने का इंतज़ार करें, फिर टैप करें। पाँच कोशिशें।" },
  word_search: { title: "शब्द खोज", blurb: "तीन थीम वाली ग्रिड। छिपे शब्दों पर उंगली घुमाएं।" },
  word_search_india: { title: "देसी शब्द खोज", blurb: "भारत के शहर, नदियाँ, मिठाइयाँ और मसाले।" },
  word_search_blitz: { title: "शब्द खोज ब्लिट्ज़", blurb: "घड़ी के खिलाफ पाँच तेज़ ग्रिड।" },
  word_search_mystery: { title: "रहस्यमय शब्द", blurb: "थीम और लंबाई दी गई है। शब्द खोजें।" },
  spot_shapes: { title: "अंतर खोजें", blurb: "दो नियॉन तस्वीरें, कुछ बदलाव। सब खोजें।" },
  spot_city: { title: "खोजें: रात का शहर", blurb: "खिड़कियाँ, टावर और चाँद। क्या बदला?" },
  spot_garden: { title: "खोजें: बगीचा", blurb: "फूल, बादल और तितलियाँ — कुछ चुपके बदलाव।" },
  spot_space: { title: "खोजें: अंतरिक्ष", blurb: "ग्रह, तारे और एक रॉकेट। ध्यान से तुलना करें।" },
  fact_fake: { title: "सच या झूठ", blurb: "सच के लिए दाएँ, झूठ के लिए बाएँ। दस बातें।" },
  fact_fake_india: { title: "सच या झूठ: भारत", blurb: "इतिहास, जगहें और संस्कृति। सच पहचानें?" },
  fact_fake_science: { title: "सच या झूठ: विज्ञान", blurb: "अंतरिक्ष, जानवर और शरीर। मिथकों से बचें।" },
  fact_fake_sports: { title: "सच या झूठ: खेल", blurb: "क्रिकेट, ओलंपिक और भी बहुत कुछ।" },
  fact_fake_filmy: { title: "सच या झूठ: फ़िल्मी", blurb: "फ़िल्म और संगीत की ट्रिविया, सच या पूरी तरह गढ़ी हुई।" },
  this_or_that: { title: "यह या वह", blurb: "एक पक्ष चुनें, फिर देखें भीड़ कहाँ खड़ी है।" },
  food_fight: { title: "फ़ूड फाइट", blurb: "चाय या कॉफ़ी? बिरयानी या पुलाव? सोचकर चुनें।" },
  desi_debates: { title: "देसी बहस", blurb: "भारत की बड़ी या-या बहस।" },
  read_the_crowd: { title: "भीड़ पढ़ें", blurb: "अंदाज़ा लगाएं ज़्यादातर खिलाड़ियों ने क्या चुना। बँटवारा जितना करीब, उतना मुश्किल।" },
  tap_dont_tap: { title: "ग्रीन लाइट, रेड लाइट", blurb: "हरे पर टैप करें, लाल छोड़ें। फिर नियम पलटते हैं। तीन जानें।" },
  fruit_frenzy: { title: "फ्रूट फ्रेंज़ी", blurb: "फल टैप करें, जंक फ़ूड कभी नहीं। तीन जानें।" },
  balloon_pop: { title: "गुब्बारा फोड़ें", blurb: "गुब्बारे फोड़ें, बमों से बचें। तीन जानें।" },
  maze_runner: { title: "भूलभुलैया", blurb: "तीन भूलभुलैया, और बड़ी होती जाएँ। जल्दी निकास खोजें।" },
  maze_gems: { title: "रत्न खोज", blurb: "हर रत्न उठाएं, तभी निकास खुलेगा।" },
  maze_fog: { title: "कोहरे में", blurb: "एक भूलभुलैया, जिसमें कुछ ही कदम दिखते हैं।" },
  maze_sprint: { title: "भूलभुलैया स्प्रिंट", blurb: "छोटी घड़ी पर पाँच तेज़ भूलभुलैया।" },
  connect_dots: { title: "बिंदु जोड़ें", blurb: "हर जोड़ी बिना काटे जोड़ें। बोर्ड भरने पर बोनस।" },
  connect_blitz: { title: "कनेक्ट ब्लिट्ज़", blurb: "पाँच छोटे बोर्ड, छोटी घड़ी।" },
  connect_xl: { title: "कनेक्ट XL", blurb: "धैर्य वाले दिमाग के लिए दो बड़े बोर्ड।" },
};

const HI_TAGS: Record<string, string> = {
  PUZZLE: "पहेली",
  ARCADE: "आर्केड",
  TRIVIA: "प्रश्नोत्तरी",
  WORD: "शब्द",
  GAME: "गेम",
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
