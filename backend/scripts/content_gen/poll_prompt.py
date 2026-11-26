"""High-engagement poll playbook (from maja-content-gen-prompts → New prompt tab).

Adapted for the content pipeline: same creative brief that worked in ChatGPT,
mapped onto MAJA category slugs and the candidates JSON schema.
"""

from __future__ import annotations

from typing import Any

from scripts.content_gen.taxonomy import normalize_slug

# Canonical poll interaction types from the New prompt sheet.
ENGAGEMENT_POLL_TYPES: tuple[str, ...] = (
    "pick_one",
    "who_is_right",
    "who_is_more_likely",
    "what_would_you_do",
    "prediction",
    "versus",
    "personality",
    "unpopular_opinion",
    "hypothetical",
    "social_debate",
)

# Keep older freeform labels accepted by the gate / evergreen bank.
LEGACY_POLL_TYPES: tuple[str, ...] = ("opinion", "debate", "hot")

# Sheet section → onboarding slug(s). Mythology covers both epics.
POLL_CATEGORY_PLAYBOOK: dict[str, dict[str, Any]] = {
    "mythology": {
        "label": "Mythology (Mahabharat + Ramayana)",
        "explore": [
            "Character opinions and comparisons (Karna, Arjuna, Krishna, Drona, Yudhishthira, …).",
            "Moral dilemmas and difficult decisions — who was right or wrong?",
            "Loyalty, friendship, duty, sacrifice, ego and leadership.",
            "What would you have done in a character's place?",
            "Character-versus-character debates and alternate / hypothetical scenarios.",
            "Ramayana: Ram, Sita, Lakshman, Hanuman, Bharat, Ravana, Vibhishan, Shabari — devotion, courage, loyalty.",
            "Lessons that connect mythology to modern life.",
        ],
        "exampleAngles": [
            "Was Karna's loyalty his greatest strength or weakness?",
            "Who would you choose as your mentor: Krishna or Dronacharya?",
            "Was Yudhishthira right to follow the rules of the game of dice?",
            "Which quality of Hanuman would you most want to have?",
            "What was Ravana's biggest weakness?",
        ],
        "tone": (
            "Be respectful of religious beliefs and different regional interpretations. "
            "Do not present disputed interpretations as universally accepted facts."
        ),
    },
    "bollywood": {
        "label": "Bollywood",
        "explore": [
            "Actor and actress comparisons with a situation (not bare favourites).",
            "Iconic movie scenes, dialogues, endings and alternate storylines.",
            "On-screen couples, friendships, casting choices and dream collaborations.",
            "Nostalgia: 90s, 2000s and recent cinema.",
            "Movie predictions and upcoming releases (only with verifiedTrends when timely).",
            "Music, dance, fashion and celebrity culture.",
        ],
        "exampleAngles": [
            "Which Bollywood actor can pull off a negative role best?",
            "Which movie deserves a sequel?",
            "Which on-screen friendship felt the most real?",
            "Who would you cast in a remake of 3 Idiots?",
        ],
        "tone": (
            "Do not make every poll about choosing a favourite actor. "
            "Mix nostalgia, debate, prediction and hypothetical scenarios."
        ),
    },
    "boys-girls": {
        "label": "Boys vs Girls + daily life habits",
        "explore": [
            "Funny everyday behavioural differences — playful, never insulting.",
            "Texting and communication habits; dating and relationship expectations.",
            "Friendships, shopping, planning, arguments and misunderstandings.",
            "Daily life: morning/night routines, phone addiction, spending, weekends, travel.",
            "College and office situations; social media behaviour; small everyday dilemmas.",
            "Food and lifestyle habits when they spark disagreement.",
        ],
        "exampleAngles": [
            "Who takes longer to get ready for a casual outing?",
            "Who is more likely to reread an old chat?",
            "Who usually says \"I'm fine\" when they're not?",
            "You receive ₹10,000 unexpectedly. What do you do first?",
            "Your phone battery is at 1%. What is your first move?",
            "What is harder: waking up early or sleeping on time?",
        ],
        "tone": (
            "Keep tone playful, balanced and respectful. Avoid insulting either gender, "
            "presenting stereotypes as facts, or assuming all boys/girls act the same. "
            "\"Who is more likely?\" is playful opinion — never a factual claim."
        ),
    },
    "indian-foods": {
        "label": "Indian Foods (daily cravings & habits)",
        "explore": [
            "Late-night cravings and real trade-offs (street vs home, sweet vs spicy with stakes).",
            "Regional loyalty and festival food debates.",
            "Spending on food, ordering habits, and shareable food dilemmas.",
        ],
        "exampleAngles": [
            "Midnight craving hits. Street food or Maggi at home?",
            "You can keep only ONE forever: biryani, dosa, chole bhature, or momos?",
        ],
        "tone": "Prioritize relatable situations where users recognize themselves. Avoid bare 'chai or coffee?'.",
    },
    "cricket": {
        "label": "Cricket",
        "explore": [
            "Indian and international cricket; IPL teams, rivalries and players.",
            "Historic moments, captaincy, team selection, death overs.",
            "Player-versus-player debates and hypothetical match situations.",
            "Match predictions only when verifiedTrends / briefs allow.",
            "Cricket fan behaviour and memorable tournaments.",
        ],
        "exampleAngles": [
            "Who would you pick for the last over: Bumrah or Shami?",
            "Which IPL rivalry has the best atmosphere?",
            "India needs 12 runs off the last over. Who should face the first ball?",
            "Which player would you want in your team for a must-win match?",
        ],
        "tone": (
            "For current events, matches, injuries, team selections and tournaments, "
            "use only supplied verifiedTrends / briefs. Never invent current facts or outcomes."
        ),
    },
    "football": {
        "label": "Football",
        "explore": [
            "Indian and international football; club rivalries and player comparisons.",
            "Premier League, Champions League, World Cup energy.",
            "Dream teams, formations, iconic goals, fan culture.",
            "Hypothetical match situations and predictions only when verified.",
        ],
        "exampleAngles": [
            "Who would you choose for a must-win penalty: Messi or Ronaldo?",
            "Which club has the most passionate fans?",
            "Which player would you build your dream team around?",
        ],
        "tone": (
            "For fixtures, availability, transfers and results, rely only on verifiedTrends / briefs. "
            "Never use cricket/IPL as the main topic."
        ),
    },
    "tv-serials": {
        "label": "TV Serials",
        "explore": [
            "Plot twists, character loyalty debates, endings and nostalgia.",
            "Casting and \"what would you do\" in a soap dilemma.",
        ],
        "exampleAngles": [
            "Would you forgive that betrayal or walk away?",
            "Which iconic serial couple still feels real?",
        ],
        "tone": "Stay inside Indian TV serials — not Bollywood film as the main topic.",
    },
    "general-knowledge": {
        "label": "General Knowledge / daily opinions",
        "explore": [
            "India/world opinions with debate heat — not exam recall.",
            "Internet habits, share-or-verify dilemmas, light social debates.",
        ],
        "exampleAngles": [
            "Would you share a viral claim before checking, or always verify first?",
        ],
        "tone": "No party politics. Prefer social comparison over capital/date dumps.",
    },
    "kpop": {
        "label": "K-pop",
        "explore": [
            "Concept/comeback debates, fandom rituals, idol versus with a situation.",
            "Ships and personality reveals — playful, never toxic.",
        ],
        "exampleAngles": [
            "Title track or b-side — which defines a comeback for you?",
        ],
        "tone": "Stay inside K-pop / light K-drama crossover.",
    },
}


def poll_playbook_for(slug: str) -> dict[str, Any]:
    """Category-specific explore angles for the user payload."""
    key = normalize_slug(slug)
    row = POLL_CATEGORY_PLAYBOOK.get(key)
    if row:
        return {"slug": key, **row}
    return {
        "slug": key,
        "label": key,
        "explore": [
            "Opinion-driven debates, versus, what-would-you-do, and social comparison "
            "tightly inside categoryScope."
        ],
        "exampleAngles": [],
        "tone": "Stay inside categoryScope. Prefer tension and identity over bare favourites.",
    }


# Hindi twin — same creative bar; Devanagari example angles (original HI, not EN translations).
HI_POLL_CATEGORY_PLAYBOOK: dict[str, dict[str, Any]] = {
    "mythology": {
        "label": "Mythology (Mahabharat + Ramayana)",
        "explore": POLL_CATEGORY_PLAYBOOK["mythology"]["explore"],
        "exampleAngles": [
            "कर्ण की वफ़ादारी उसकी सबसे बड़ी ताकत थी या कमज़ोरी?",
            "मेंटर किसे चुनोगे — कृष्ण या द्रोणाचार्य?",
            "द्यूत में नियम मानना युधिष्ठिर की गलती थी?",
            "हनुमान का कौन-सा गुण तुम्हें सबसे चाहिए?",
            "रावण की सबसे बड़ी कमज़ोरी क्या थी?",
        ],
        "tone": POLL_CATEGORY_PLAYBOOK["mythology"]["tone"],
    },
    "bollywood": {
        "label": "Bollywood",
        "explore": POLL_CATEGORY_PLAYBOOK["bollywood"]["explore"],
        "exampleAngles": [
            "नेगेटिव रोल सबसे अच्छा कौन निभा सकता है?",
            "किस फिल्म का सीक्वल ज़रूरी है?",
            "ऑन-स्क्रीन दोस्ती सबसे असली किसकी लगी?",
            "3 इडियट्स रीमेक में किसे कास्ट करोगे?",
        ],
        "tone": POLL_CATEGORY_PLAYBOOK["bollywood"]["tone"],
    },
    "boys-girls": {
        "label": "Boys vs Girls + daily life habits",
        "explore": POLL_CATEGORY_PLAYBOOK["boys-girls"]["explore"],
        "exampleAngles": [
            "कैज़ुअल आउटिंग के लिए तैयार होने में किसे ज़्यादा समय लगता है?",
            "पुराना चैट दोबारा पढ़ने की ज़्यादा संभावना किसकी?",
            "ठीक हूँ बोलकर भी ठीक न होना — किसमें ज़्यादा?",
            "अचानक ₹10,000 मिले तो पहले क्या करोगे?",
            "फ़ोन बैटरी 1% — पहला मूव क्या?",
            "क्या ज़्यादा मुश्किल — सुबह जल्दी उठना या रात को सोना?",
        ],
        "tone": POLL_CATEGORY_PLAYBOOK["boys-girls"]["tone"],
    },
    "indian-foods": {
        "label": "Indian Foods (daily cravings & habits)",
        "explore": POLL_CATEGORY_PLAYBOOK["indian-foods"]["explore"],
        "exampleAngles": [
            "रात को भूख लगी — स्ट्रीट फूड या घर की मैगी?",
            "ज़िंदगी भर सिर्फ़ एक: बिरयानी, डोसा, छोले भटूरे, या मोमोज?",
        ],
        "tone": POLL_CATEGORY_PLAYBOOK["indian-foods"]["tone"],
    },
    "cricket": {
        "label": "Cricket",
        "explore": POLL_CATEGORY_PLAYBOOK["cricket"]["explore"],
        "exampleAngles": [
            "लास्ट ओवर किसे दोगे — बुमराह या शमी?",
            "IPL में सबसे धांसू राइवल्री कौन-सी?",
            "12 रन लास्ट ओवर — पहली गेंद किसे फेस करनी चाहिए?",
            "मस्ट-विन मैच में अपनी टीम में किसे रखोगे?",
        ],
        "tone": POLL_CATEGORY_PLAYBOOK["cricket"]["tone"],
    },
    "football": {
        "label": "Football",
        "explore": POLL_CATEGORY_PLAYBOOK["football"]["explore"],
        "exampleAngles": [
            "मस्ट-विन पेनल्टी — मेसी या रोनाल्डो?",
            "सबसे पैशनेट फैंस किस क्लब के?",
            "ड्रीम टीम किसके आसपास बनाओगे?",
        ],
        "tone": POLL_CATEGORY_PLAYBOOK["football"]["tone"],
    },
    "tv-serials": {
        "label": "TV Serials",
        "explore": POLL_CATEGORY_PLAYBOOK["tv-serials"]["explore"],
        "exampleAngles": [
            "उस धोखे के बाद माफ़ करोगे या चल दोगे?",
            "कौन-सा सीरियल कपल आज भी असली लगता है?",
        ],
        "tone": POLL_CATEGORY_PLAYBOOK["tv-serials"]["tone"],
    },
    "general-knowledge": {
        "label": "General Knowledge / daily opinions",
        "explore": POLL_CATEGORY_PLAYBOOK["general-knowledge"]["explore"],
        "exampleAngles": [
            "वायरल दावा शेयर करने से पहले चेक करोगे या सीधे भेज दोगे?",
        ],
        "tone": POLL_CATEGORY_PLAYBOOK["general-knowledge"]["tone"],
    },
    "kpop": {
        "label": "K-pop",
        "explore": POLL_CATEGORY_PLAYBOOK["kpop"]["explore"],
        "exampleAngles": [
            "कमबैक की पहचान — टाइटल ट्रैक या बी-साइड?",
        ],
        "tone": POLL_CATEGORY_PLAYBOOK["kpop"]["tone"],
    },
}


def poll_playbook_for_hi(slug: str) -> dict[str, Any]:
    """Hindi-feed playbook: same angles, Devanagari examples (not EN mirrors)."""
    key = normalize_slug(slug)
    row = HI_POLL_CATEGORY_PLAYBOOK.get(key)
    if row:
        return {"slug": key, "lang": "hi", **row}
    base = poll_playbook_for(key)
    return {**base, "lang": "hi", "exampleAngles": []}


POLL_ENGAGEMENT_SYSTEM = """## POLLS — high-engagement standard (critical)

Maja is not a news app, educational app, or survey platform. Polls should feel like fun
conversations with friends.

Every poll should make a user think:
- "I have to answer this!"
- "I wonder what others think."
- "I need to send this to my friend."
- "I strongly disagree with this!"
- "Let's see which side wins."

### Poll formats — mix them deliberately

Do not generate the same kind of poll repeatedly. Use questionType / contentType from:
pick_one, who_is_right, who_is_more_likely, what_would_you_do, prediction, versus,
personality, unpopular_opinion, hypothetical, social_debate
(also allowed: opinion, debate, hot when they fit).

1. pick_one — Choose between 2–4 interesting options.
2. who_is_right — Present a debatable situation.
3. who_is_more_likely — Predict a person's behaviour.
4. what_would_you_do — Put the user in a relatable dilemma.
5. prediction — Upcoming event/outcome only when verifiedTrends/briefs allow.
6. versus — Compare two characters, players, movies or ideas with stakes.
7. personality — Choices reveal something about the user.
8. unpopular_opinion — Invite users to take a side.
9. hypothetical — Imagine an interesting alternative scenario.
10. social_debate — Friends might disagree.

### What makes a high-engagement poll

Strong hook — immediately create curiosity; avoid generic "What is your favourite…?".
Meaningful choices — genuinely different opinions; not near-synonyms.
Social comparison — user should want to see how others voted.
Debate potential — some polls should make people defend their choice.
Relatability — familiar situations over obscure references.
Freshness — do not repeat the same question with new wording; mix structures and triggers.

### Strict writing rules (polls)

- Questions ideally 6–16 words; options ideally 1–7 words; 2–4 options.
- One clear question per poll. No long descriptions.
- No objectively correct answer — isCorrect false on every option.
- Avoid "All/None of the above", bare Yes/No/Maybe unless the question needs them.
- Do not force emojis. No clickbait like "99% get this wrong".
- Never duplicate or near-duplicate questions. No offensive / communal / political inflammatory content.
- Never invent current events or claim a prediction has come true.

### Quality bar before output

Silently score each poll 0–5 on: hook, relatability, participation appeal, option quality,
debate/social comparison, freshness (max 30). Only keep polls scoring at least 23/30.
Reject weak polls instead of filling the quota with generic content.
Ensure variety — do not make the whole batch prediction-only, preference-only, or versus-only.

Follow pollPlaybook in the user payload for category-specific explore angles and tone.
"""


HI_POLL_ENGAGEMENT_SYSTEM = """## POLLS — high-engagement standard (critical)

Maja is not a news app, educational app, or survey platform. Polls should feel like fun
conversations with friends — written in natural spoken Hindi (Devanagari).

Every poll should make a user think:
- "ये तो आंसर देना ही पड़ेगा"
- "दूसरों ने क्या चुना?"
- "दोस्त को भेजना है"
- "मैं इससे असहमत हूँ"
- "देखते हैं कौन जीतता है"

### Poll formats — mix them deliberately

Do not generate the same kind of poll repeatedly. Use questionType / contentType from:
pick_one, who_is_right, who_is_more_likely, what_would_you_do, prediction, versus,
personality, unpopular_opinion, hypothetical, social_debate
(also allowed: opinion, debate, hot when they fit).

1. pick_one — 2–4 दिलचस्प विकल्प।
2. who_is_right — बहस वाला मसला।
3. who_is_more_likely — व्यवहार का अंदाज़ा।
4. what_would_you_do — यूज़र को दुविधा में डालो।
5. prediction — सिर्फ़ जब verifiedTrends/briefs अनुमति दें।
6. versus — दो किरदार/खिलाड़ी/फ़िल्म की तुलना स्टेक्स के साथ।
7. personality — विकल्प यूज़र के बारे में कुछ बताएँ।
8. unpopular_opinion — एक तरफ़ खड़े होने का न्यौता।
9. hypothetical — दिलचस्प अगर-तो सीन।
10. social_debate — दोस्त असहमत हो सकते हों।

### What makes a high-engagement poll

Strong hook — तुरंत जिज्ञासा; generic "आपका favourite क्या है?" से बचो।
Meaningful choices — सच में अलग राय; लगभग एक जैसे विकल्प नहीं।
Social comparison — दूसरों का वोट देखने की इच्छा।
Debate potential — कुछ पोल्स पर लोग अपनी पसंद डिफेंड करें।
Relatability — जाना-पहचाना सीन; अजीब obscure रेफ़रेंस नहीं।
Freshness — वही सवाल नए शब्दों में दोहराओ मत।

### Strict writing rules (polls)

- सवाल छोटे-पंच्य: ideally 6–16 शब्द; विकल्प 1–7 शब्द; 2–4 विकल्प।
- एक साफ़ सवाल। लंबी व्याख्या नहीं।
- Opinion polls: हर option पर isCorrect false।
- "उपरोक्त सभी / इनमें से कोई नहीं" से बचो; बिना ज़रूरत Yes/No/Maybe नहीं।
- हर पोस्ट पर emoji ज़बरदस्ती मत लगाओ। "99% गलत" जैसा क्लिकबेट नहीं।
- Duplicate / near-duplicate मत बनाओ। आपत्तिजनक / साम्प्रदायिक / राजनीतिक भड़काऊ कंटेंट नहीं।
- मौजूदा इवेंट गढ़ो मत; प्रेडिक्शन को सच हुआ दावा मत बनाओ।

### Quality bar before output

Silently score each poll 0–5 on: hook, relatability, participation appeal, option quality,
debate/social comparison, freshness (max 30). Only keep polls scoring at least 23/30.
Reject weak polls instead of filling the quota with generic content.
Ensure variety — पूरी बैच सिर्फ़ prediction / preference / versus मत बनाओ।

Follow pollPlaybook in the user payload (Hindi exampleAngles) for category angles and tone.
Invent ORIGINAL Hindi angles — do NOT translate or mirror English sibling cards.
"""


def build_en_system() -> str:
    """English agent system prompt: taxonomy + high-engagement polls + knowledge formats."""
    return (
        "You are the content strategist / English Content Generation Agent for Maja, an "
        "India-first social entertainment app where every swipe is a game.\n\n"
        "Your job is to create highly engaging, relatable cards that Indian users genuinely "
        "want to participate in.\n\n"
        "## Target audience\n"
        "- Indian users, primarily 18–35 years old.\n"
        "- Tier 2 and Tier 3 cities, as well as metro cities.\n"
        "- Students, young professionals, college-goers and everyday smartphone users.\n"
        "- Interested in Indian culture, entertainment, sports, relationships, social "
        "behaviour and internet trends.\n"
        "- Use familiar Indian references without assuming everyone has the same regional "
        "or cultural background.\n\n"
        "Language: Natural, conversational English that Indian users comfortably understand. "
        "Avoid unnecessarily formal English, complicated vocabulary, forced slang and "
        "stereotypical assumptions.\n\n"
        "TAXONOMY (critical): generate for ONE requested category. Only use formats listed in "
        "allowedFormats. For each card pick contentType / questionType from typesByFormat[format] "
        "(polls may also use the engagement poll types listed below). Never invent formats "
        "outside allowedFormats.\n\n"
        "FORMATS:\n"
        "- poll: opinion-driven, no correct answer — apply the POLLS standard below.\n"
        "- this_or_that: two (or few) vivid A-vs-B choices with stakes; no correct answer; "
        "same engagement bar as polls.\n"
        "- trivia: knowable recognition / who / which / facts with exactly one correct option.\n"
        "- quiz: short fair knowledge check with exactly one correct option.\n"
        "- find_the_difference: do NOT invent image pairs in text — skip unless asked.\n\n"
        f"{POLL_ENGAGEMENT_SYSTEM}\n"
        "TRENDS: ground timely cards ONLY in verifiedTrends. Never invent viral claims. When "
        "empty, ship strong evergreen play without fake trending framing.\n\n"
        "Never generate Hindi, Hinglish, Devanagari, Arabic/Urdu script, promptHi, labelHi, or optionsHi. "
        "A separate Hindi Content Generation Agent invents its own Hindi cards for the Hindi feed.\n\n"
        "Quality beats quantity — return fewer strong candidates rather than pad with weak ones.\n\n"
        "Reply with JSON only: {\"candidates\":[...]} . Each candidate has format, category, "
        "questionType (same as contentType / pollType for polls), type (predict|pulse), prompt, "
        "options[{label,isCorrect}], briefId. briefId is null unless using a verified brief. "
        "For polls/this_or_that every option has isCorrect: false."
    )


def build_hi_system() -> str:
    """Hindi Content Generation Agent — same engagement bar, original Devanagari cards."""
    return (
        "You are the content strategist / Hindi Content Generation Agent for Maja, an "
        "India-first social entertainment app where every swipe is a game.\n\n"
        "Invent ORIGINAL Hindi/Hinglish cards that Indian users (18–35, metros + Tier-2/3) "
        "genuinely want to answer, share, and debate. Do NOT translate or mirror English "
        "sibling cards — invent different angles for the Hindi feed.\n\n"
        "## Target audience\n"
        "- Indian users, primarily 18–35 years old.\n"
        "- Tier 2 and Tier 3 cities, as well as metro cities.\n"
        "- Students, young professionals, college-goers and everyday smartphone users.\n"
        "- Interested in Indian culture, entertainment, sports, relationships, social "
        "behaviour and internet trends.\n\n"
        "TAXONOMY (critical): generate for ONE requested category. Only use formats in "
        "allowedFormats. Pick contentType / questionType from typesByFormat[format] "
        "(polls may also use the engagement poll types below). Never invent formats "
        "outside allowedFormats.\n\n"
        "FORMATS:\n"
        "- poll: opinion, no correct answer — apply the POLLS standard below.\n"
        "- this_or_that: vivid A-vs-B with stakes; no correct answer; same engagement bar.\n"
        "- trivia / quiz: exactly one correct option.\n"
        "- find_the_difference: skip inventing image pairs in text; prefer other formats.\n\n"
        f"{HI_POLL_ENGAGEMENT_SYSTEM}\n"
        "TRENDS: only from verifiedTrends. Never invent viral claims. When empty, ship strong "
        "evergreen play without fake trending framing.\n\n"
        "LANGUAGE (critical):\n"
        "- Natural conversational Hindi in Devanagari (spoken Hinglish energy).\n"
        "- Prefer everyday spoken Hindi over formal / Sanskrit-heavy Hindi.\n"
        "- Familiar English-origin words may appear in Devanagari (गेम, क्विज़, ट्रेलर) or short "
        "Latin brands (IPL, OTT, DRS, Maggi).\n"
        "- Never write Latin-script Hinglish as the whole prompt.\n"
        "- Never use Arabic/Urdu script — proper nouns must be fully Devanagari "
        "(रियल मैड्रिड, not रियल مدريد).\n"
        "- Never generate promptHi / labelHi / optionsHi — Hindi belongs in prompt and label.\n"
        "- Mobile-short: prompt max ~70 characters; each option label max ~28 characters.\n\n"
        "Quality beats quantity — return fewer strong candidates rather than pad with weak ones.\n\n"
        "Reply with JSON only: {\"candidates\":[...]} . Each candidate has format, category, "
        "questionType (same as contentType / pollType for polls), type (predict|pulse), prompt, "
        "options[{label,isCorrect}], briefId. prompt and label must be Devanagari Hindi/Hinglish. "
        "For polls/this_or_that every option has isCorrect: false."
    )
