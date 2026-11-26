"""OpenAI agents that propose poll and quiz cards. A gate drops anything the catalog cannot support.

MAJA content generation uses two separate language agents and two moment pools:

1. English Content Agent — invents English-only cards (prompt / label). content_lang=en.
2. Hindi Content Agent — invents original Devanagari Hindi cards (prompt / label). content_lang=hi.

Pools never share questions. English must not contain Hindi; Hindi must not contain English leftovers.
Localization (promptHi on the same card) is obsolete for new feed publishes.
"""

from __future__ import annotations

import json
import os
import random
import re
import urllib.request
from datetime import UTC, date, datetime, timedelta
from typing import Any

from scripts.content_gen.catalog import (
    POLLS,
    QUIZZES,
    TREND_POLL_TYPES,
    TREND_QUIZ_TYPES,
    Card,
    bank_labels,
    bank_text,
    briefs_for,
    fact_issues,
    generate_stock,
    has_arabic,
    has_devanagari,
    has_hinglish_latin,
    load_briefs,
    normalize_manual_trends,
    prefer_devanagari,
    question_types,
    strip_devanagari,
    trends_for,
)
from scripts.content_gen.hi_generate_prompt import HI_GENERATE_SYSTEM
from scripts.content_gen.hi_localize_prompt import HI_LOCALIZE_SYSTEM
from scripts.content_gen.poll_prompt import (
    ENGAGEMENT_POLL_TYPES,
    build_en_system,
    poll_playbook_for,
    poll_playbook_for_hi,
)
from scripts.content_gen.taxonomy import (
    FORMAT_FIND_THE_DIFFERENCE,
    FORMAT_POLL,
    FORMAT_QUIZ,
    FORMAT_THIS_OR_THAT,
    FORMAT_TRIVIA,
    KNOWLEDGE_FORMATS,
    OPINION_FORMATS,
    TEXT_FORMATS,
    category_scope,
    format_to_scoring_mode,
    format_to_tags,
    formats_for,
    is_quiz_only_category,
    normalize_slug,
    taxonomy_payload,
    types_for,
)

# Outcome-prediction wording about seasons/tournaments that are already closed.
_PREDICTIONISH_RE = re.compile(
    r"(?i)\b("
    r"prediction|"
    r"who\s+will\s+win|who\s+wins|who'?ll\s+win|"
    r"will\s+\w[\w\s]{0,40}\s+win|"
    r"champion\s+of|lift\s+the\s+(?:cup|trophy)|take\s+the\s+trophy|"
    r"winner\s+of"
    r")\b"
)
_YEAR_RE = re.compile(r"\b(20\d{2})\b")
# Seasons that are typically over by mid-year in India (safe to treat as closed after June).
_MIDYEAR_CLOSED_TOURNAMENTS_RE = re.compile(
    r"(?i)\b(ipl|indian\s+premier\s+league|pro\s+kabaddi|pkl|isl\b|indian\s+super\s+league)\b"
)
_FORWARD_LOOKING_RE = re.compile(
    r"(?i)\b(next|upcoming|tonight|today|this\s+weekend|tomorrow|coming\s+up|yet\s+to\s+play)\b"
)
# Time-sensitive "who holds office / who is current X" claims go stale fast — brief only.
_VOLATILE_FACT_RE = re.compile(
    r"(?i)\b("
    r"(?:current|present|incumbent|sitting|right\s+now|as\s+of\s+(?:now|today)|nowadays)"
    r".{0,48}"
    r"(?:chief\s+minister|\bcm\b|prime\s+minister|\bpm\b|president|governor|mayor|"
    r"home\s+minister|finance\s+minister|defence\s+minister|defense\s+minister|"
    r"speaker|captain|coach|ceo|chairman|chairperson)|"
    r"who\s+is\s+(?:the\s+)?(?:current|present|incumbent|new)\b|"
    r"who\s+(?:currently|presently)\b|"
    r"(?:which|who).{0,40}\b(?:in\s+power|ruling\s+party|governs|governing)\b"
    r")"
)
# sports = Sports (Non-Cricket). Drop anything that belongs in the cricket category.
_CRICKET_TOPIC_RE = re.compile(
    r"(?i)\b("
    r"cricket|ipl\b|t20i?\b|odis?\b|bcci|"
    r"wicket|batsm[ae]n|batters?|bowlers?|bowling\s+attack|innings|powerplay|"
    r"yorker|googly|doosra|lbw\b|drs\b|super\s+over|run[\s-]?out|"
    r"test\s+match|ranji|indian\s+premier\s+league|"
    r"orange\s+cap|purple\s+cap|ipl\s+auction|"
    r"kohli|virat|rohit\s+sharma|bumrah|dhoni|jadeja|hardik|"
    r"sanju\s+samson|gambhir|rahul\s+dravid|sachin|sehwag|"
    r"indian\s+cricket|cricket\s+world\s+cup|world\s+cup\s+of\s+cricket"
    r")\b"
)
# cricket category: reject cards whose primary topic is clearly a non-cricket sport.
_NON_CRICKET_SPORT_RE = re.compile(
    r"(?i)\b("
    r"football|soccer|fifa|uefa|premier\s+league|la\s+liga|isl\b|indian\s+super\s+league|"
    r"nba|basketball|f1\b|formula\s*1|badminton|tennis|kabaddi|pro\s+kabaddi|pkl\b|"
    r"hockey|chess|olympics|athletics|boxing|wrestling|ufc|mlb|nfl"
    r")\b"
)
# Lazy preference polls that make the feed feel like a generic survey.
_LAZY_POLL_RE = re.compile(
    r"(?i)^\s*("
    r"who\s+is\s+your\s+favou?rite\b|"
    r"who'?s\s+your\s+favou?rite\b|"
    r"which\s+(?:\w+\s+){0,4}do\s+you\s+(?:prefer|like|love)\b|"
    r"do\s+you\s+like\s+.+\?\s*$|"
    r"what\s+is\s+your\s+favou?rite\b|"
    r"which\s+(?:\w+\s+){0,3}(?:actor|actress|player|singer|team|movie|film)\s+do\s+you\s+(?:love|like|prefer)\b|"
    r"chai\s+or\s+coffee\s*\??\s*$|"
    r"sweet\s+or\s+spicy\s*\??\s*$|"
    r"android\s+or\s+(?:iphone|ios)\s*\??\s*$|"
    r"(?:theatre|theater)\s+or\s+ott\s*\??\s*$"
    r")"
)
# Opinion / preference wording that must never appear on scored quiz/trivia cards.
_OPINION_IN_KNOWLEDGE_RE = re.compile(
    r"(?i)\b("
    r"you\s+prefer|your\s+(?:favou?rite|vibe|mood|lane)|"
    r"which\s+do\s+you|"
    r"would\s+you\s+(?:rather|pick|choose)|"
    r"pick\s+the\s+answer\s+you\s+think|"
    r"what\s+feels?\s+(?:right|better)|"
    r"rounds?\s+feel|"
    r"you\s+prefer\s+word\s+puzzles"
    r")\b"
)
# Meta definitions of puzzle types ("a riddle is a…") — not actual puzzles to solve.
_META_PUZZLE_DEF_RE = re.compile(
    r"(?i)\b("
    r"(?:anagram|riddle|synonym|sudoku|puzzle)\s+(?:is|are)\s+(?:a|an)\b|"
    r"hides?\s+the\s+answer\s+in\s+wordplay|"
    r"rearranging\s+letters\s+to\s+form\s+a\s+new\s+word|"
    r"a\s+short\s+question\s+that\s+hides|"
    r"matching\s+two\s+identical\s+cards|"
    r"finding\s+changes\s+between\s+two\s+similar"
    r")\b"
)
# Claims that something is trending/viral require verifiedTrends or a brief.
_TREND_CLAIM_RE = re.compile(
    r"(?i)\b("
    r"trending|viral|blowing\s+up|"
    r"everyone'?s\s+talking|"
    r"breaking\s+right\s+now|"
    r"currently\s+trending|"
    r"all\s+over\s+(?:india|instagram|twitter|x\b|the\s+internet)|"
    r"india\s+is\s+obsessed"
    r")\b"
)
_HI_FIELD_KEYS = frozenset({"promptHi", "prompt_hi", "labelHi", "label_hi", "optionsHi", "options_hi"})

# High-engagement poll playbook from spreadsheet "New prompt" tab (poll_prompt.py).
EN_SYSTEM = build_en_system()
_STOP_TOKENS = frozenset(
    {
        "the",
        "a",
        "an",
        "you",
        "your",
        "to",
        "of",
        "in",
        "for",
        "is",
        "are",
        "do",
        "or",
        "and",
        "who",
        "what",
        "which",
        "will",
        "would",
        "your",
        "vs",
        "with",
        "from",
        "that",
        "this",
        "more",
        "than",
        "about",
    }
)

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_FRESHNESS_HOURS = 4


class MissingOpenAIKey(RuntimeError):
    """The content job cannot choose questions without OPENAI_API_KEY."""


def require_key() -> str:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        raise MissingOpenAIKey("OPENAI_API_KEY is not set. Add it to the environment before generating.")
    return key


def _category_scope(slug: str) -> dict[str, Any]:
    """Tell the model what this category covers (taxonomy-driven)."""
    return category_scope(slug)


def _category_rules(slug: str) -> list[str]:
    key = normalize_slug(slug)
    playbook = poll_playbook_for(key)
    shared = [
        "Stay inside categoryScope for this slug only.",
        "Only use allowedFormats and typesByFormat from the user payload "
        "(polls may use engagement pollTypes from pollPlaybook / POLLS standard).",
        "If verifiedTrends is empty: ship strong evergreen PLAY — do NOT fake viral framing.",
        "Polls: follow pollPlaybook explore angles and tone. Aim for 23/30+ engagement quality.",
        "Vary formats across the batch when multiple formats are allowed.",
    ]
    specific: dict[str, list[str]] = {
        "football": [
            "SCOPE (critical): football only — never cricket/IPL/T20 as the main topic.",
        ],
        "cricket": [
            "SCOPE: IPL, internationals, formats, rules, debates — not football as the main topic.",
            "Rotate star names — do not spam Kohli / Rohit / Dhoni across the batch.",
        ],
        "bollywood": [
            "Do not make every poll about a favourite actor — mix nostalgia, debate, hypothetical.",
        ],
        "mythology": [
            "Respect religious beliefs and regional versions. Never insult.",
            "Cover both Mahabharat and Ramayana angles across batches.",
        ],
        "tv-serials": [
            "Plot twists, character debates, nostalgia — Indian TV serials only.",
        ],
        "indian-foods": [
            "Late-night dilemmas with stakes, regional loyalty — not bare chai-or-coffee.",
        ],
        "general-knowledge": [
            "India/world opinions and shareable habits — no party politics or exam-cram dumps.",
        ],
        "kpop": [
            "Concept/comeback debates and fandom rituals — stay inside K-pop.",
        ],
        "boys-girls": [
            "POLL ONLY. Playful balanced who-is-more-likely / daily dilemmas — never insult either gender.",
            "Never present stereotypes as facts.",
        ],
        "math-puzzles": [
            "QUIZ ONLY — never polls or preferences. Every card needs one objectively correct answer.",
            "Ship solvable number/pattern puzzles (sequences, odd-one-out, quick calc) — not meta definitions.",
        ],
        "memory-games": [
            "Prefer find_the_difference / memory themes; skip inventing fake image URLs.",
            "Never invent opinion polls about memory games.",
        ],
        "word-puzzles": [
            "QUIZ ONLY — never polls or 'which do you prefer' opinions. One correct answer every time.",
            "Ship solvable puzzles: anagrams to unscramble, riddles to solve, missing letters, synonyms.",
            "BAD: meta definitions like 'A short question that hides the answer in wordplay is a…'.",
            "GOOD: 'Unscramble PLEAP' / 'I have keys but no locks — what am I?' / 'Fill in C_FF__'.",
        ],
        "maths": [
            "QUIZ ONLY — never polls. Everyday arithmetic, percentages, ratios with one correct answer.",
        ],
    }
    tone = str(playbook.get("tone") or "").strip()
    extras = list(specific.get(key, []))
    if tone:
        extras.append(f"POLL TONE: {tone}")
    return [*shared, *extras]


def normalize_verified_trends(briefs: list[dict[str, Any]], *, today: date | None = None) -> list[dict[str, Any]]:
    """Provider-agnostic trend context derived from verified event briefs (never invent trends)."""
    today = today or datetime.now(UTC).date()
    out: list[dict[str, Any]] = []
    for brief in briefs:
        if not isinstance(brief, dict) or not brief.get("id"):
            continue
        raw_date = str(brief.get("eventDate") or "").strip()
        event_day: date | None = None
        if raw_date:
            try:
                event_day = date.fromisoformat(raw_date[:10])
            except ValueError:
                event_day = None
        if event_day is None:
            event_status = "unknown"
            freshness = "verified"
        elif event_day > today:
            event_status = "upcoming"
            freshness = "upcoming"
        elif event_day == today:
            event_status = "live"
            freshness = "live"
        else:
            event_status = "completed"
            freshness = "recent"
        angles = [str(a) for a in (brief.get("angles") or []) if str(a).strip()]
        allowed = list(angles) if angles else ["trivia", "which", "opinion", "debate"]
        if brief.get("allowPrediction") and event_status in {"upcoming", "live", "unknown"}:
            if "prediction" not in allowed:
                allowed.append("prediction")
        elif "prediction" in allowed and event_status == "completed":
            allowed = [a for a in allowed if a != "prediction"]
        out.append(
            {
                "trendId": str(brief["id"]),
                "topic": str(brief.get("title") or brief.get("context") or brief["id"]),
                "category": str(brief.get("category") or ""),
                "freshness": freshness,
                "eventStatus": event_status,
                "eventDate": raw_date or None,
                "facts": list(brief.get("facts") or []),
                "allowedAngles": allowed,
                "allowPrediction": bool(brief.get("allowPrediction")) and event_status != "completed",
                "sourceConfidence": "high",
                "context": str(brief.get("context") or ""),
                "source": "brief",
                "briefId": str(brief["id"]),
                "brief": brief,
            }
        )
    return out


def merge_verified_trends(
    slug: str,
    briefs: list[dict[str, Any]],
    *,
    manual_rows: list[dict[str, Any]] | None = None,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Merge ops manual trends with brief-derived trends for one category."""
    now = now or datetime.now(UTC)
    brief_trends = normalize_verified_trends(briefs, today=now.date())
    manual = normalize_manual_trends(
        manual_rows if manual_rows is not None else trends_for(slug, now=now),
        slug=slug,
        now=now,
    )
    # Manual first (ops India pulse), then briefs; de-dupe by trendId.
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in [*manual, *brief_trends]:
        tid = str(row.get("trendId") or "")
        if not tid or tid in seen:
            continue
        seen.add(tid)
        merged.append(row)
    return merged


def build_format_mix(slug: str, need: int) -> dict[str, int]:
    """Allocate batch slots across allowed text formats for this category.

    find_the_difference is excluded from LLM quotas (image pack spice handles it).
    """
    key = normalize_slug(slug)
    allowed = [f for f in formats_for(key) if f in TEXT_FORMATS]
    if not allowed:
        return {}
    # Prefer a balanced spread; knowledge vs opinion when both exist.
    weights: dict[str, float] = {}
    for fmt in allowed:
        if fmt in KNOWLEDGE_FORMATS:
            weights[fmt] = 1.2
        elif fmt == FORMAT_THIS_OR_THAT:
            weights[fmt] = 0.9
        else:
            weights[fmt] = 1.0
    total_w = sum(weights.values()) or 1.0
    raw = {fmt: need * (weights[fmt] / total_w) for fmt in allowed}
    targets = {fmt: max(1, int(round(raw[fmt]))) for fmt in allowed}
    # Fix rounding so sum ~= need (never below number of formats).
    while sum(targets.values()) > need and any(v > 1 for v in targets.values()):
        fmt = max(targets, key=lambda f: targets[f])
        if targets[fmt] > 1:
            targets[fmt] -= 1
    while sum(targets.values()) < need:
        # Prefer knowledge formats when topping up.
        fmt = max(allowed, key=lambda f: (f in KNOWLEDGE_FORMATS, -targets[f]))
        targets[fmt] += 1
    return targets


def build_shared_system_rules(
    today: str,
    quiz_target: int,
    poll_target: int,
    *,
    format_targets: dict[str, int] | None = None,
) -> list[str]:
    if format_targets:
        mix_bits = ", ".join(f"~{n} {fmt}" for fmt, n in format_targets.items())
        mix_rule = (
            f"FORMAT MIX (critical): cover EVERY allowed text format — {mix_bits}. "
            "Do not dump the whole batch into one format. "
            "Within each format, vary contentType / questionType from typesByFormat — "
            "do not repeat the same type more than twice in the batch."
        )
        if poll_target == 0:
            mix_rule += " Opinion polls / this_or_that are NOT allowed for this category."
    else:
        mix_rule = (
            f"MIX (soft target): about {quiz_target} knowledge cards and {poll_target} opinion cards. "
            "Quality beats quotas — fewer strong cards beat weak fill."
            if poll_target
            else f"MIX: about {quiz_target} knowledge/puzzle cards only — no opinion polls."
        )
    return [
        "Return JSON with a candidates array. English fields only — never promptHi, labelHi, or optionsHi.",
        "Every candidate category must equal the requested category.",
        "Stay inside categoryScope — never write a card that belongs in a different onboarding category.",
        f"Today is {today}. Prefer verified live/upcoming India context from verifiedTrends when present.",
        "Never invent a trend. Never claim something is trending/viral without a matching verifiedTrends row.",
        mix_rule,
        "FORMAT FIELD (critical): set format to exactly one of allowedFormats "
        "(poll | trivia | this_or_that | quiz). Put opinion cards in poll/this_or_that; "
        "put knowable one-correct-answer cards in trivia or quiz — never mis-label them.",
        "questionType / contentType MUST be from typesByFormat[format] for that format.",
        "Skip find_the_difference in text generation (image pack handles it).",
        "Predictions: at most ~10% of the batch, only for upcoming verifiedTrends/briefs with briefId when required.",
        "If verifiedTrends is empty: ship strong evergreen PLAY (scenarios, recognition, sharp debates) "
        "— without viral/trending wording. Evergreen is not a synonym for boring trivia.",
        "Not formal survey speak. Not essays. Spicy but friendly. Understandable in ~3 seconds.",
        "MOBILE READABILITY (critical): prompt max ~90 characters / ~18 words. Option labels max ~36 characters.",
        "Write a complete readable question — never cryptic stubs like 'Heat level. You…' or 'Movement today is…'.",
        "Avoid long dictionary definitions ('X is a…' with a paragraph). Keep quizzes punchy and scannable.",
        "trivia/quiz: exactly one correct option. poll/this_or_that: isCorrect false on every option.",
        "Incorrect quiz/trivia options must be plausible — no absurd distractors, no 'All/None of the above'.",
        "Two options use type predict. Three or four use type pulse.",
        "Do not use gambling words.",
    ]


def build_interaction_rules() -> list[str]:
    """Lean rules — creative bar for polls lives in EN_SYSTEM / pollPlaybook (New prompt)."""
    return [
        "POLLS: apply the POLLS high-engagement standard in the system prompt. "
        "Mix questionTypes across pick_one / who_is_right / who_is_more_likely / what_would_you_do / "
        "versus / personality / unpopular_opinion / hypothetical / social_debate "
        "(prediction only when verified and open).",
        "Prefer specific situations with stakes over abstract favourites. "
        "Reject bare 'Who is your favourite…?', 'Do you like X?', 'Which do you prefer?', "
        "or bare chai/coffee / sweet/spicy / Android/iPhone / theatre-or-OTT with no situation.",
        "Only keep polls you would score ≥23/30 on hook + relatability + participation + "
        "option quality + debate/social comparison + freshness.",
        "Knowledge cards (trivia/quiz): recognition, surprising-but-fair fact, or clear rule — "
        "not capital/date exam recall.",
        "One verified trend → normally ONE strong angle — not five paraphrases.",
        "Vary interaction patterns across the batch so consecutive cards feel different.",
    ]


def build_uniqueness_rules() -> list[str]:
    return [
        "Write brand-new prompts. Never reuse or lightly rephrase anything in avoidPrompts.",
        "UNIQUENESS (critical): each candidate must cover a DIFFERENT topic/angle — not the same question with new wording.",
        "NAME DIVERSITY (critical): do not reuse the same player/celebrity/team/franchise focus across multiple cards in one batch.",
        "Treat avoidNames as a strong exclusion signal for opinion/debate focus.",
        "Knowledge trivia is encouraged: rules, formats, history, records, definitions — not only celebrity preference polls.",
        "BAD uniqueness: 'Theatre or OTT?' and 'How do you prefer to watch films?'.",
        "Vary subjects, stakes, formats, and questionType across the batch so consecutive cards feel different.",
        "Learn from engagementInsights: copy the PATTERN of hits (format, length, debate heat); never clone exact wording; follow lessons.",
    ]


def build_event_fact_rules(today: str) -> list[str]:
    return [
        "Prioritize verifiedTrends that are LIVE or UPCOMING for THIS category (manual India trends JSON + briefs). Skip party politics.",
        "One verified trend → normally ONE strong interaction angle (trivia OR debate OR prediction), not five paraphrases.",
        "CLOSED / PAST EVENTS (critical): NEVER ask users to predict the outcome of a match, tournament, season, "
        "election, award, or final that has already concluded as of today.",
        f"BAD past prediction: 'Who will win IPL 2026?' when IPL {today[:4]} is already over by {today}.",
        "BAD past prediction: 'Prediction: who wins the final?' for a final that already happened.",
        "OK on past events: opinion/debate only ('Fair Player of the Match?', 'Was that the right call?').",
        "OK predictions: only UPCOMING fixtures (tonight / this weekend / next match) that have not started — "
        "and only with briefId when questionType is prediction.",
        "If unsure whether an event is still open, write an opinion/debate/hot poll instead of a prediction.",
        "Polls use engagement questionTypes (versus, what_would_you_do, social_debate, …) "
        "or opinion/debate/hot for freeform India-trend options.",
        "Trend quizzes use questionType trivia, who, or which with STABLE well-known facts only (rules, definitions, permanent records) "
        "OR facts listed on a verifiedTrends row.",
        "NEVER write a freeform quiz about who currently holds an office (CM, PM, president, captain, coach, CEO) — those need a verified briefId.",
        "BAD freeform quiz: 'Who is the current Chief Minister of Delhi?' / 'Who is India's PM right now?'.",
        "OK freeform quiz: stable rules/definitions for THIS category (e.g. 'What does OTT stand for?' for movies/tech).",
        "Time-sensitive politics/news facts belong in briefs/verifiedTrends — or write an opinion/debate poll instead of a quiz.",
        "A prediction prompt must contain the word Prediction, set briefId, and the brief must allow it.",
        "Bank quizzes (evergreen types not in trendQuizTypes) must copy prompt and options from the evergreen bank.",
        "Event/brief copy may use only names and numbers that appear in that brief / verified trend facts.",
        "Do NOT say trending/viral/everyone's talking unless the topic matches a verifiedTrends entry.",
    ]


def build_english_purity_rules() -> list[str]:
    """Mirrors EN_SYSTEM / English Content Generation Agent prompt — Latin English only."""
    return [
        "ENGLISH ONLY (critical): prompt and option.label must be natural English. Latin script only.",
        "Never generate Hindi, Hinglish, Devanagari, Hindi transliteration, promptHi, labelHi, or optionsHi.",
        "Never use Arabic/Urdu script (ا ب پ …) in English fields.",
        "NO Hinglish in English fields: never use Hindi words or Latin transliteration "
        "(yaar, kya, kitna, bahut, nahi, scene hai, full on, etc.).",
        "English must read like English a fluent speaker would write — not Hindi written in Latin letters.",
        "Indian names, brand names, movie titles, and proper nouns in English are fine.",
        "Hindi feed cards are invented by a separate Hindi generation agent — never mix languages.",
    ]


def build_hindi_purity_rules() -> list[str]:
    """Mirrors HI_GENERATE_SYSTEM / Hindi Content Generation Agent prompt — Devanagari only."""
    return [
        "HINDI ONLY (critical): prompt and option.label must be Devanagari Hindi/Hinglish.",
        "Every prompt and every option label must contain Devanagari. Reject Latin-only copy.",
        "Never write English-only sentences. Never write Latin-script Hinglish as the whole card "
        "('Kya scene hai', 'Kitne excited ho').",
        "No bilingual fields ('Excited! / एक्साइटेड'). No promptHi, labelHi, or optionsHi.",
        "Never use Arabic/Urdu script (ا ب پ …). Names like Real Madrid must be fully Devanagari "
        "(रियल मैड्रिड), never mixed scripts like रियल مدريد.",
        "Short Latin brands/acronyms inside Hindi (IPL, OTT, DRS, Maggi) are OK; long English leftovers are not.",
        "Invent ORIGINAL Hindi cards — do not translate or mirror English sibling prompts.",
    ]


def build_output_contract(need: int) -> list[str]:
    return [
        "Output schema per candidate: format, category, questionType, type, prompt, options[{label,isCorrect}], briefId.",
        "Do NOT include promptHi, labelHi, or optionsHi — they are forbidden in this stage.",
        f"Aim for about {need} strong candidates. Quality over quantity — return fewer rather than pad with weak cards.",
        "Pass an internal swipe-feed check before including a card: clear in ~3s, reason to tap, specific not generic.",
    ]


def _messages(
    slug: str,
    need: int,
    briefs: list[dict[str, Any]],
    avoid_prompts: list[str] | None = None,
    insights: dict[str, Any] | None = None,
    *,
    manual_trends: list[dict[str, Any]] | None = None,
    now: datetime | None = None,
) -> list[dict[str, str]]:
    now = now or datetime.now(UTC)
    today_date = now.date()
    today = today_date.isoformat()
    slug = normalize_slug(slug)
    format_targets = build_format_mix(slug, need)
    quiz_target, poll_target = mix_targets_for(slug, need, format_targets)
    quiz_only = is_quiz_only_category(slug)
    trends = merge_verified_trends(slug, briefs, manual_rows=manual_trends, now=now)
    tax = taxonomy_payload(slug)
    # LLM text formats only in preferFormats (FTD via pack).
    text_formats = [f for f in tax["allowedFormats"] if f in TEXT_FORMATS]
    payload = {
        "category": slug,
        "categoryLabel": tax["categoryLabel"],
        "categoryScope": tax["categoryScope"],
        "allowedFormats": text_formats,
        "typesByFormat": {k: v for k, v in tax["typesByFormat"].items() if k in TEXT_FORMATS},
        "need": need,
        "today": today,
        "mix": {
            "formatTargets": format_targets,
            "quizzes": quiz_target,
            "polls": poll_target,
            "quizShare": round(quiz_target / max(need, 1), 2),
            "pollShare": round(poll_target / max(need, 1), 2),
            "predictionsMaxShare": 0.0 if quiz_only else 0.1,
            "preferQuizTypes": (
                sorted(question_types(slug, FORMAT_QUIZ))
                if quiz_only
                else ["trivia", "who", "which"]
            ),
            "preferPollTypes": [] if poll_target == 0 else list(ENGAGEMENT_POLL_TYPES),
            "preferFormats": text_formats,
            "maxSameContentType": 2,
        },
        "market": (
            "India English feed for Gen-Z (metros + Tier-2/3). "
            + (
                "QUIZ ONLY for this category — solvable puzzles with one correct answer. No polls."
                if quiz_only
                else "Fast swipe interactions across poll / trivia / this_or_that / quiz. "
            )
            + " Hindi is a separate generation agent with its own card pool — never mix."
        ),
        "pollPlaybook": (
            {"slug": slug, "explore": [], "disabled": True, "reason": "quiz-only-category"}
            if poll_target == 0
            else poll_playbook_for(slug)
        ),
        "pollQuestionTypes": sorted(question_types(slug, FORMAT_POLL)),
        "quizQuestionTypes": sorted(question_types(slug, FORMAT_QUIZ)),
        "triviaQuestionTypes": sorted(question_types(slug, FORMAT_TRIVIA)),
        "thisOrThatTypes": sorted(question_types(slug, FORMAT_THIS_OR_THAT)),
        "trendQuizTypes": [] if quiz_only else sorted(TREND_QUIZ_TYPES),
        "evergreenBank": bank_text(slug),
        "verifiedTrends": [
            {k: v for k, v in t.items() if k != "brief"} for t in trends
        ],
        "briefs": briefs,
        "avoidPrompts": list(avoid_prompts or [])[:120],
        "avoidNames": sorted(
            {n for prompt in (avoid_prompts or []) for n in proper_names(str(prompt))}
        )[:40],
        "engagementInsights": insights or {},
        "voiceExamples": {
            "englishGood": (
                [
                    "Unscramble these letters to make a fruit: PLEAP",
                    "I have keys but no locks, space but no room. What am I?",
                    "What comes next: 2, 4, 8, 16, …?",
                    "Fill in the blanks: C_FF__",
                    "Which number does not belong: 3, 5, 7, 9, 11?",
                    "Half of 100 is…",
                ]
                if quiz_only
                else [
                    "Who would you pick for the last over: Bumrah or Shami?",
                    "Was Karna's loyalty his greatest strength or weakness?",
                    "Which Bollywood actor can pull off a negative role best?",
                    "You receive ₹10,000 unexpectedly. What do you do first?",
                    "Who is more likely to reread an old chat?",
                    "Your phone battery is at 1%. What is your first move?",
                    "Midnight craving hits. Street food or Maggi at home?",
                    "How many balls are there in a standard over?",
                ]
            ),
            "englishBad": [
                "A short question that hides the answer in wordplay is a…",
                "You prefer word puzzles that are…",
                "Anagram rounds feel…",
                "Who is your favourite actor?",
                "Do you like cricket?",
                "Which do you prefer?",
                "Chai or coffee?",
                *(
                    []
                    if quiz_only
                    else [
                        "Kya scene hai for the release?",
                        "What is your preferred late-night dining option?",
                        "Sweet or spicy?",
                        "What is your favourite festival?",
                        "This is trending everywhere in India right now — guess why?",
                    ]
                ),
            ],
        },
        "rules": [
            *build_shared_system_rules(today, quiz_target, poll_target, format_targets=format_targets),
            *([] if quiz_only else build_interaction_rules()),
            *build_uniqueness_rules(),
            *([] if quiz_only else build_event_fact_rules(today)),
            *build_english_purity_rules(),
            *build_output_contract(need),
            *_category_rules(slug),
        ],
    }
    return [
        {"role": "system", "content": EN_SYSTEM},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def _messages_hi(
    slug: str,
    need: int,
    briefs: list[dict[str, Any]],
    avoid_prompts: list[str] | None = None,
    insights: dict[str, Any] | None = None,
    *,
    manual_trends: list[dict[str, Any]] | None = None,
    now: datetime | None = None,
) -> list[dict[str, str]]:
    """User/system messages for the Hindi Content Generation Agent (original HI cards)."""
    now = now or datetime.now(UTC)
    today = now.date().isoformat()
    slug = normalize_slug(slug)
    format_targets = build_format_mix(slug, need)
    quiz_target, poll_target = mix_targets_for(slug, need, format_targets)
    quiz_only = is_quiz_only_category(slug)
    trends = merge_verified_trends(slug, briefs, manual_rows=manual_trends, now=now)
    tax = taxonomy_payload(slug)
    text_formats = [f for f in tax["allowedFormats"] if f in TEXT_FORMATS]
    shared = [
        r
        for r in build_shared_system_rules(
            today, quiz_target, poll_target, format_targets=format_targets
        )
        if "English fields only" not in r
    ]
    shared.insert(
        0,
        "Return JSON with a candidates array. Hindi Devanagari in prompt/label only — never promptHi/labelHi.",
    )
    shared.append("Only use allowedFormats and typesByFormat from this payload.")
    if quiz_only:
        shared.append(
            "QUIZ ONLY — solvable puzzles with one correct answer. Never invent polls or preference questions."
        )
    hi_output = [
        "Output schema per candidate: format, category, questionType, type, prompt, options[{label,isCorrect}], briefId.",
        "prompt and options[].label are Devanagari Hindi. Do NOT include promptHi, labelHi, or optionsHi.",
        f"Aim for about {need} strong candidates. Quality over quantity — return fewer rather than pad with weak cards.",
        "Pass an internal swipe-feed check before including a card: clear in ~3s, reason to tap, specific not generic.",
    ]
    payload = {
        "category": slug,
        "categoryLabel": tax["categoryLabel"],
        "categoryScope": tax["categoryScope"],
        "allowedFormats": text_formats,
        "typesByFormat": {k: v for k, v in tax["typesByFormat"].items() if k in TEXT_FORMATS},
        "need": need,
        "today": today,
        "contentLang": "hi",
        "mix": {
            "formatTargets": format_targets,
            "quizzes": quiz_target,
            "polls": poll_target,
            "quizShare": round(quiz_target / max(need, 1), 2),
            "pollShare": round(poll_target / max(need, 1), 2),
            "predictionsMaxShare": 0.0 if quiz_only else 0.1,
            "preferQuizTypes": (
                sorted(question_types(slug, FORMAT_QUIZ))
                if quiz_only
                else ["trivia", "who", "which"]
            ),
            "preferPollTypes": [] if poll_target == 0 else list(ENGAGEMENT_POLL_TYPES),
            "preferFormats": text_formats,
            "maxSameContentType": 2,
        },
        "market": (
            "India Hindi feed for Gen-Z (metros + Tier-2/3). "
            + (
                "QUIZ ONLY — solvable puzzles with one correct answer. No polls. "
                if quiz_only
                else "Invent original Devanagari Hinglish cards — not translations of English. "
            )
            + "English is a separate generation agent with its own pool."
        ),
        "pollPlaybook": (
            {"slug": slug, "explore": [], "disabled": True, "reason": "quiz-only-category"}
            if poll_target == 0
            else poll_playbook_for_hi(slug)
        ),
        "pollQuestionTypes": sorted(question_types(slug, FORMAT_POLL)),
        "quizQuestionTypes": sorted(question_types(slug, FORMAT_QUIZ)),
        "triviaQuestionTypes": sorted(question_types(slug, FORMAT_TRIVIA)),
        "thisOrThatTypes": sorted(question_types(slug, FORMAT_THIS_OR_THAT)),
        "trendQuizTypes": [] if quiz_only else sorted(TREND_QUIZ_TYPES),
        "evergreenBank": (
            "English bank is topic reference only. Do NOT copy English bank prompts/labels. "
            + (
                "Invent original Hindi solvable puzzles (anagrams, riddles, number patterns) with one correct answer."
                if quiz_only
                else "Invent original Hindi freeform quizzes and polls "
                "(versus / what_would_you_do / who_is_more_likely / trivia/who/which)."
            )
        ),
        "verifiedTrends": [{k: v for k, v in t.items() if k != "brief"} for t in trends],
        "briefs": briefs,
        "avoidPrompts": list(avoid_prompts or [])[:120],
        "avoidNames": sorted(
            {n for prompt in (avoid_prompts or []) for n in proper_names(str(prompt))}
        )[:40],
        "engagementInsights": insights or {},
        "voiceExamples": {
            "hindiGood": (
                [
                    "अक्षर जोड़कर फल बनाओ: PLEAP",
                    "चाबी है ताला नहीं, जगह है कमरा नहीं — क्या हूँ?",
                    "आगे क्या: 2, 4, 8, 16, …?",
                    "खाली जगह भरो: C_FF__",
                    "कौन-सा नंबर फिट नहीं: 3, 5, 7, 9, 11?",
                    "100 का आधा कितना?",
                ]
                if quiz_only
                else [
                    "लास्ट ओवर किसे दोगे — बुमराह या शमी?",
                    "कर्ण की वफ़ादारी ताकत थी या कमज़ोरी?",
                    "नेगेटिव रोल सबसे अच्छा कौन निभाएगा?",
                    "अचानक ₹10,000 मिले तो पहले क्या करोगे?",
                    "पुराना चैट दोबारा पढ़ने की संभावना किसकी ज़्यादा?",
                    "फ़ोन बैटरी 1% — पहला मूव क्या?",
                    "रात को भूख लगी — स्ट्रीट फूड या घर की मैगी?",
                    "एक ओवर में कितनी गेंदें होती हैं?",
                ]
            ),
            "hindiBad": [
                "What's your vibe for the release?",
                "Kya scene hai for the match?",
                "Kitne excited ho?",
                "Excited! / कितने एक्साइटेड हो?",
                "Who is your favourite actor?",
                "आपका favourite एक्टर कौन है?",
                "क्या आपको क्रिकेट पसंद है?",
                "चाय या कॉफ़ी?",
                "This is trending everywhere — guess why?",
            ],
        },
        "rules": [
            *shared,
            *([] if quiz_only else build_interaction_rules()),
            *build_uniqueness_rules(),
            *([] if quiz_only else build_event_fact_rules(today)),
            *build_hindi_purity_rules(),
            *hi_output,
            *(
                []
                if quiz_only
                else [
                    "Predictions: include प्रेडिक्शन or Prediction in the Hindi prompt when questionType is prediction.",
                    "Prefer engagement pollTypes (versus / what_would_you_do / who_is_more_likely / …) "
                    "and freeform trivia/who/which — do not copy English evergreen bank wording.",
                    "Only keep Hindi polls you would score ≥23/30. Follow pollPlaybook Hindi exampleAngles for voice.",
                ]
            ),
            *_category_rules(slug),
        ],
    }
    return [
        {"role": "system", "content": HI_GENERATE_SYSTEM},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def resolve_chat_endpoint(key: str) -> tuple[str, str]:
    """OpenAI by default. Keys that start with sk-or- use OpenRouter."""
    base = os.environ.get("OPENAI_BASE_URL", "").strip().rstrip("/")
    if not base:
        base = "https://openrouter.ai/api/v1" if key.startswith("sk-or-") else "https://api.openai.com/v1"
    model = os.environ.get("OPENAI_MODEL", "").strip() or DEFAULT_MODEL
    if "openrouter.ai" in base and "/" not in model:
        model = f"openai/{model}"
    return base, model


def call_openai(messages: list[dict[str, str]]) -> dict[str, Any]:
    key = require_key()
    base, model = resolve_chat_endpoint(key)
    body = {
        "model": model,
        "messages": messages,
        "temperature": 0.85,
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as res:
        payload = json.loads(res.read().decode())
    content = payload["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    if not isinstance(parsed, dict):
        raise ValueError("OpenAI response was not a JSON object")
    return parsed


def _ends_at(
    brief: dict[str, Any] | None,
    now: datetime,
    *,
    default_hours: int = DEFAULT_FRESHNESS_HOURS,
) -> datetime:
    if brief is not None:
        hours = int(brief.get("freshnessHours") or default_hours)
        return now + timedelta(hours=hours)
    return now + timedelta(hours=default_hours)


def _prompt_tokens(text: str) -> set[str]:
    cleaned = re.sub(r"[^a-z0-9\s]", " ", (text or "").lower())
    return {tok for tok in cleaned.split() if tok not in _STOP_TOKENS and len(tok) > 2}


_NAME_STOP = frozenset(
    {
        "The",
        "A",
        "An",
        "Who",
        "What",
        "Which",
        "How",
        "When",
        "Where",
        "Why",
        "India",
        "Indian",
        "Prediction",
        "Player",
        "Match",
        "Team",
        "Game",
        "Movie",
        "Film",
        "Song",
        "Music",
        "News",
        "Diwali",
        "IPL",
        "T20",
        "OTT",
        "DRS",
    }
)
_PROPER_NAME_RE = re.compile(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b")


def proper_names(text: str) -> set[str]:
    """Person/place-style Latin names in a prompt (used to stop star-name spam)."""
    names: set[str] = set()
    for match in _PROPER_NAME_RE.finditer(text or ""):
        name = match.group(1).strip()
        if not name or name in _NAME_STOP:
            continue
        if " " in name or len(name) >= 5:
            names.add(name.lower())
    return names


def near_duplicate_prompt(a: str, b: str, *, threshold: float = 0.55) -> bool:
    """True when two prompts share most content words (rephrase / same question)."""
    ta, tb = _prompt_tokens(a), _prompt_tokens(b)
    if not ta or not tb:
        return False
    return len(ta & tb) / len(ta | tb) >= threshold


def past_outcome_issue(prompt: str, today: date | None = None) -> str | None:
    """Reject outcome predictions for seasons/events that are already closed."""
    today = today or datetime.now(UTC).date()
    text = (prompt or "").strip()
    if not text or not _PREDICTIONISH_RE.search(text):
        return None
    years = [int(y) for y in _YEAR_RE.findall(text)]
    if years and max(years) < today.year:
        return "past-outcome"
    if (
        years
        and max(years) == today.year
        and today.month >= 6
        and _MIDYEAR_CLOSED_TOURNAMENTS_RE.search(text)
        and not _FORWARD_LOOKING_RE.search(text)
    ):
        return "past-outcome"
    if re.search(r"(?i)\b(already\s+over|already\s+won|last\s+season|yesterday'?s\s+final)\b", text):
        return "past-outcome"
    return None


def volatile_fact_issue(prompt: str) -> str | None:
    """Reject freeform quizzes about who currently holds a changing office or role."""
    text = (prompt or "").strip()
    if not text:
        return None
    if _VOLATILE_FACT_RE.search(text):
        return "volatile-fact"
    return None


def off_category_topic_issue(slug: str, prompt: str, labels: list[str] | None = None) -> str | None:
    """Reject cards that clearly belong in another onboarding category."""
    slug = normalize_slug(slug)
    text = " ".join([prompt or "", *(labels or [])]).strip()
    if not text:
        return None
    if slug == "football":
        if _CRICKET_TOPIC_RE.search(text):
            return "cricket-in-football"
        return None
    if slug == "cricket":
        # Non-cricket sport as the main topic (no cricket anchors) belongs in football.
        if _NON_CRICKET_SPORT_RE.search(text) and not _CRICKET_TOPIC_RE.search(text):
            return "non-cricket-in-cricket"
        return None
    return None


def lazy_poll_issue(fmt: str, prompt: str) -> str | None:
    """Reject generic favourite/prefer survey prompts that make the feed feel empty."""
    if fmt not in OPINION_FORMATS:
        return None
    if _LAZY_POLL_RE.search(prompt or ""):
        return "lazy-poll"
    return None


def opinion_in_knowledge_issue(fmt: str, prompt: str) -> str | None:
    """Scored quiz/trivia must be real questions — not preference/opinion prompts."""
    if fmt not in KNOWLEDGE_FORMATS:
        return None
    if _OPINION_IN_KNOWLEDGE_RE.search(prompt or ""):
        return "opinion-in-knowledge"
    return None


def puzzle_play_issue(slug: str, fmt: str, prompt: str) -> str | None:
    """Quiz-only puzzle categories: real solvable puzzles, never polls or meta definitions."""
    if not is_quiz_only_category(slug):
        return None
    if fmt in OPINION_FORMATS or fmt == FORMAT_POLL:
        return "poll-in-puzzle"
    if fmt in KNOWLEDGE_FORMATS and _META_PUZZLE_DEF_RE.search(prompt or ""):
        return "meta-definition"
    return None


def mix_targets_for(slug: str, need: int, format_targets: dict[str, int]) -> tuple[int, int]:
    """Quiz vs poll soft targets. Quiz-only categories never request polls."""
    knowledge_n = sum(format_targets.get(f, 0) for f in KNOWLEDGE_FORMATS)
    opinion_n = sum(format_targets.get(f, 0) for f in OPINION_FORMATS)
    if is_quiz_only_category(slug) or (knowledge_n and not opinion_n):
        return max(1, knowledge_n or need), 0
    if opinion_n and not knowledge_n:
        return 0, max(1, opinion_n)
    if knowledge_n and opinion_n:
        return max(1, knowledge_n), max(1, opinion_n)
    quiz_target = max(1, round(need * 0.6))
    return quiz_target, max(1, need - quiz_target)


# Feed cards must stay readable on a phone — long prompts crowd answer rows.
_MAX_PROMPT_CHARS = 90
_MAX_PROMPT_WORDS = 20
_MAX_OPTION_CHARS = 48
# Ultra-short unfinished stubs like "Heat level. You…" read as broken UI copy.
_CRYPTIC_STUB_RE = re.compile(r"(?i)^\s*.{0,18}\byou\s*[.…]+?\s*$")


def mobile_prompt_issue(prompt: str, labels: list[str] | None = None) -> str | None:
    """Reject copy that will render unreadably small or cryptic on the feed card."""
    text = (prompt or "").strip()
    if not text:
        return "empty-prompt"
    words = len(text.split())
    if len(text) > _MAX_PROMPT_CHARS or words > _MAX_PROMPT_WORDS:
        return "prompt-too-long"
    if _CRYPTIC_STUB_RE.search(text):
        return "cryptic-stub"
    for label in labels or []:
        if len((label or "").strip()) > _MAX_OPTION_CHARS:
            return "option-too-long"
    return None


def _trend_support_blob(trends: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for row in trends:
        parts.append(str(row.get("topic") or ""))
        parts.append(str(row.get("context") or ""))
        parts.extend(str(f) for f in (row.get("facts") or []))
    return " ".join(parts).lower()


def unverified_trend_claim_issue(
    prompt: str,
    *,
    brief_id: str | None,
    verified_trends: list[dict[str, Any]] | None,
) -> str | None:
    """Reject trending/viral framing unless grounded in verifiedTrends or a brief."""
    text = (prompt or "").strip()
    if not text or not _TREND_CLAIM_RE.search(text):
        return None
    if brief_id:
        return None
    trends = verified_trends or []
    if not trends:
        return "unverified-trend"
    blob = _trend_support_blob(trends)
    tokens = _prompt_tokens(text)
    # Require at least one meaningful content overlap with supplied trend material.
    support_tokens = _prompt_tokens(blob)
    if tokens & support_tokens:
        return None
    return "unverified-trend"


def interaction_pattern(card: Card) -> str:
    """Fingerprint = format + content type so subcategory/type diversity is real."""
    fmt = (card.format or FORMAT_POLL).lower()
    q = (card.question_type or "").lower() or "other"
    return f"{fmt}:{q}"


def discard_localization_fields(item: dict[str, Any]) -> dict[str, Any]:
    """English agent must not own Hindi fields — drop any accidental localization output."""
    out = {k: v for k, v in item.items() if k not in _HI_FIELD_KEYS}
    mapped: list[Any] = []
    for opt in item.get("options") or []:
        if not isinstance(opt, dict):
            mapped.append(opt)
            continue
        mapped.append({k: v for k, v in opt.items() if k not in _HI_FIELD_KEYS})
    out["options"] = mapped
    return out


def score_candidate(
    card: Card,
    *,
    insights: dict[str, Any] | None = None,
    used_patterns: set[str] | None = None,
    format_counts: dict[str, int] | None = None,
    format_targets: dict[str, int] | None = None,
) -> float:
    """Rank recognisable + interactive + fresh + format/type diversity."""
    score = 0.0
    fmt = card.format or FORMAT_POLL
    if fmt in KNOWLEDGE_FORMATS:
        score += 3.0
        if card.question_type in TREND_QUIZ_TYPES or card.question_type in {"who", "which", "facts"}:
            score += 1.5
    elif fmt == FORMAT_THIS_OR_THAT:
        score += 2.2
    elif card.question_type in set(ENGAGEMENT_POLL_TYPES) or card.question_type in {
        "debate",
        "hot",
        "opinion",
    }:
        # High-engagement poll types — do not under-rank vs trivia.
        score += 2.4 if card.question_type in set(ENGAGEMENT_POLL_TYPES) else 2.0
    else:
        score += 1.5
    # Boost formats that are under their target so the batch fills each subcategory.
    if format_targets and format_counts is not None:
        target = format_targets.get(fmt, 0)
        have = format_counts.get(fmt, 0)
        if target and have < target:
            score += 4.0 * (1.0 - have / target)
        elif target and have >= target:
            score -= 2.0
    if card.brief_id:
        score += 2.5
    prompt = card.prompt or ""
    words = len(prompt.split())
    if 6 <= words <= 18:
        score += 1.0
    elif words > 22 or len(prompt) > _MAX_PROMPT_CHARS:
        score -= 2.0
    if mobile_prompt_issue(prompt, [str(o.get("label") or "") for o in card.options]):
        score -= 5.0
    if lazy_poll_issue(card.format, prompt):
        score -= 5.0
    if _TREND_CLAIM_RE.search(prompt) and not card.brief_id:
        # Prefer grounded cards; unverified claims should already be gated out.
        score -= 1.0
    pattern = interaction_pattern(card)
    if used_patterns and pattern in used_patterns:
        score -= 1.5
    lessons = " ".join(str(x) for x in (insights or {}).get("lessons") or []).lower()
    if lessons:
        if "debate" in lessons and card.question_type == "debate":
            score += 0.5
        if "trivia" in lessons and card.format in KNOWLEDGE_FORMATS:
            score += 0.5
        if "short" in lessons and words <= 14:
            score += 0.3
    return score


def rank_and_diversify(
    cards: list[Card],
    need: int,
    *,
    insights: dict[str, Any] | None = None,
    slug: str | None = None,
) -> list[Card]:
    """Prefer strong cards while filling each allowed format and varying types."""
    if len(cards) <= need:
        return list(cards)
    format_targets = build_format_mix(slug, need) if slug else {}
    remaining = list(cards)
    chosen: list[Card] = []
    used_patterns: set[str] = set()
    format_counts: dict[str, int] = {}
    type_counts: dict[str, int] = {}
    while remaining and len(chosen) < need:
        remaining.sort(
            key=lambda c: score_candidate(
                c,
                insights=insights,
                used_patterns=used_patterns,
                format_counts=format_counts,
                format_targets=format_targets or None,
            )
            - (3.0 if type_counts.get(f"{c.format}:{c.question_type}", 0) >= 2 else 0.0),
            reverse=True,
        )
        pick = remaining.pop(0)
        type_key = f"{pick.format}:{pick.question_type}"
        chosen.append(pick)
        used_patterns.add(interaction_pattern(pick))
        format_counts[pick.format] = format_counts.get(pick.format, 0) + 1
        type_counts[type_key] = type_counts.get(type_key, 0) + 1
    return chosen


def needs_fact_verify(card: Card) -> bool:
    """Freeform knowledge cards without a brief must pass an LLM fact gate before publish."""
    return (
        card.format in KNOWLEDGE_FORMATS
        and (
            card.question_type in TREND_QUIZ_TYPES
            or card.question_type in {"who", "which", "facts", "recognition"}
        )
        and not card.brief_id
    )


def prediction_brief_open(brief: dict[str, Any], prompt: str, today: date | None = None) -> bool:
    """Predictions need allowPrediction; past-dated briefs must stay forward-looking."""
    if not brief.get("allowPrediction"):
        return False
    today = today or datetime.now(UTC).date()
    raw_date = str(brief.get("eventDate") or "").strip()
    if not raw_date:
        return True
    try:
        event_day = date.fromisoformat(raw_date[:10])
    except ValueError:
        return True
    if event_day >= today:
        return True
    return bool(_FORWARD_LOOKING_RE.search(prompt or ""))


def validate_candidates(
    raw: dict[str, Any],
    slug: str,
    briefs: list[dict[str, Any]] | None = None,
    now: datetime | None = None,
    *,
    freshness_hours: int = DEFAULT_FRESHNESS_HOURS,
    avoid_prompts: list[str] | None = None,
    verified_trends: list[dict[str, Any]] | None = None,
    content_lang: str = "en",
) -> tuple[list[Card], list[str]]:
    """Keep candidates that match the catalog. Drop the rest with a short reason.

    content_lang=en strips Hindi and requires Latin English.
    content_lang=hi requires Devanagari and strips English leftovers — never mixes pools.
    """
    now = now or datetime.now(UTC)
    today = now.date()
    lang = "hi" if content_lang == "hi" else "en"
    rows = briefs_for(slug, briefs if briefs is not None else load_briefs())
    by_id = {str(row["id"]): row for row in rows}
    allowed_bank = bank_text(slug)
    trends = (
        verified_trends
        if verified_trends is not None
        else merge_verified_trends(slug, rows, now=now)
    )
    dropped: list[str] = []
    cards: list[Card] = []
    kept_prompts: list[str] = []
    used_names: set[str] = set()
    avoid = [str(p).strip() for p in (avoid_prompts or []) if str(p).strip()]
    avoid_names: set[str] = set()
    for prev in avoid:
        avoid_names |= proper_names(prev)
    pattern_counts: dict[str, int] = {}
    for index, item in enumerate(raw.get("candidates") or []):
        if not isinstance(item, dict):
            dropped.append(f"{index}:shape")
            continue
        # Never trust the other language's fields on either agent.
        cleaned = discard_localization_fields(item)
        cleaned = _normalize_candidate_options(cleaned)
        # Script purity must fail before strip helpers empty fields (EN + HI agent prompts).
        raw_prompt = str(cleaned.get("prompt") or "")
        raw_labels = [
            str(opt.get("label") or "")
            for opt in (cleaned.get("options") or [])
            if isinstance(opt, dict)
        ]
        if has_arabic(raw_prompt) or any(has_arabic(label) for label in raw_labels):
            dropped.append(f"{index}:arabic-script")
            continue
        if lang == "hi":
            if not has_devanagari(raw_prompt) or any(
                not has_devanagari(label) for label in raw_labels
            ):
                dropped.append(f"{index}:hindi-script")
                continue
        else:
            if has_devanagari(raw_prompt) or any(has_devanagari(label) for label in raw_labels):
                dropped.append(f"{index}:english-script")
                continue
        cleaned = _hindi_only_fields(cleaned) if lang == "hi" else _english_only_fields(cleaned)
        cleaned["format"] = _normalize_candidate_format(cleaned) or (
            FORMAT_POLL if cleaned.get("pollType") or cleaned.get("question") else ""
        )
        cleaned["questionType"] = _candidate_content_type(cleaned)
        cleaned["category"] = normalize_slug(str(cleaned.get("category") or slug))
        reason = _reject(cleaned, slug, by_id, allowed_bank, today=today, content_lang=lang)
        if reason:
            dropped.append(f"{index}:{reason}")
            continue
        prompt = str(cleaned["prompt"]).strip()
        fmt = str(cleaned["format"])
        if past_outcome_issue(prompt, today):
            dropped.append(f"{index}:past-outcome")
            continue
        if lazy_poll_issue(fmt, prompt):
            dropped.append(f"{index}:lazy-poll")
            continue
        if opinion_in_knowledge_issue(fmt, prompt):
            dropped.append(f"{index}:opinion-in-knowledge")
            continue
        puzzle_issue = puzzle_play_issue(slug, fmt, prompt)
        if puzzle_issue:
            dropped.append(f"{index}:{puzzle_issue}")
            continue
        option_labels = [
            str(opt.get("label") or "").strip()
            for opt in (cleaned.get("options") or [])
            if isinstance(opt, dict)
        ]
        mobile_issue = mobile_prompt_issue(prompt, option_labels)
        if mobile_issue:
            dropped.append(f"{index}:{mobile_issue}")
            continue
        brief_id = cleaned.get("briefId") or None
        if unverified_trend_claim_issue(
            prompt,
            brief_id=str(brief_id) if brief_id else None,
            verified_trends=trends,
        ):
            dropped.append(f"{index}:unverified-trend")
            continue
        if any(near_duplicate_prompt(prompt, prev) for prev in kept_prompts):
            dropped.append(f"{index}:near-duplicate")
            continue
        if any(near_duplicate_prompt(prompt, prev) for prev in avoid):
            dropped.append(f"{index}:avoid-near-duplicate")
            continue
        names = proper_names(prompt)
        # One focused star/name per batch; also skip names already hammered in avoidPrompts.
        if names & used_names:
            dropped.append(f"{index}:name-repeat")
            continue
        if names & avoid_names and fmt not in KNOWLEDGE_FORMATS:
            # Opinion/debate about the same star again — prefer knowledge trivia instead.
            dropped.append(f"{index}:avoid-name")
            continue
        brief = by_id.get(str(brief_id)) if brief_id else None
        options = cleaned["options"]
        mapped_options = [
            {"label": str(opt["label"]).strip(), "isCorrect": bool(opt.get("isCorrect"))}
            for opt in options
        ]
        content_type = _candidate_content_type(cleaned) or str(cleaned.get("questionType") or "")
        card = Card(
            type=cleaned["type"],
            category_slug=normalize_slug(slug),
            format=fmt,
            question_type=content_type,
            prompt=prompt,
            options=mapped_options,
            scoring_mode=format_to_scoring_mode(fmt),
            tags=format_to_tags(fmt, slug),
            ends_at=_ends_at(brief, now, default_hours=freshness_hours),
            brief_id=str(brief_id) if brief_id else None,
            event_date=str(brief.get("eventDate") or "") if brief else None,
            facts_used=list(brief.get("facts") or []) if brief else [],
            prompt_hi=None,
        )
        pattern = interaction_pattern(card)
        # Soft cap: same format+type at most twice once the batch has enough variety.
        if pattern_counts.get(pattern, 0) >= 2 and len(kept_prompts) >= 4:
            dropped.append(f"{index}:type-repeat")
            continue
        cards.append(card)
        kept_prompts.append(prompt)
        used_names |= names
        pattern_counts[pattern] = pattern_counts.get(pattern, 0) + 1
    return cards, dropped


def _english_only_fields(item: dict[str, Any]) -> dict[str, Any]:
    """Copy a candidate with Devanagari stripped from English prompt/label fields."""
    out = dict(item)
    out["prompt"] = strip_devanagari(str(item.get("prompt") or ""))
    mapped: list[Any] = []
    for opt in item.get("options") or []:
        if not isinstance(opt, dict):
            mapped.append(opt)
            continue
        row = dict(opt)
        row["label"] = strip_devanagari(str(opt.get("label") or ""))
        mapped.append(row)
    out["options"] = mapped
    return out


def _hindi_only_fields(item: dict[str, Any]) -> dict[str, Any]:
    """Copy a candidate with English leftovers stripped from Hindi prompt/label fields."""
    out = dict(item)
    out["prompt"] = prefer_devanagari(str(item.get("prompt") or ""))
    mapped: list[Any] = []
    for opt in item.get("options") or []:
        if not isinstance(opt, dict):
            mapped.append(opt)
            continue
        row = dict(opt)
        row["label"] = prefer_devanagari(str(opt.get("label") or ""))
        mapped.append(row)
    out["options"] = mapped
    return out


_PREDICTION_HI_RE = re.compile(r"(?i)prediction|प्रेडिक्शन|भविष्यवाणी|अंदाज़ा|अंदाजा")


def _normalize_candidate_format(item: dict[str, Any]) -> str:
    raw = str(item.get("format") or "").strip().lower()
    aliases = {
        "this-or-that": FORMAT_THIS_OR_THAT,
        "thisnthat": FORMAT_THIS_OR_THAT,
        "this_n_that": FORMAT_THIS_OR_THAT,
        "ftd": FORMAT_FIND_THE_DIFFERENCE,
        "spot_difference": FORMAT_FIND_THE_DIFFERENCE,
        "spot-the-difference": FORMAT_FIND_THE_DIFFERENCE,
    }
    return aliases.get(raw, raw)


_POLL_TYPE_ALIASES = {
    "PICK_ONE": "pick_one",
    "WHO_IS_RIGHT": "who_is_right",
    "WHO_IS_MORE_LIKELY": "who_is_more_likely",
    "WHAT_WOULD_YOU_DO": "what_would_you_do",
    "PREDICTION": "prediction",
    "VERSUS": "versus",
    "PERSONALITY": "personality",
    "UNPOPULAR_OPINION": "unpopular_opinion",
    "HYPOTHETICAL": "hypothetical",
    "SOCIAL_DEBATE": "social_debate",
}


def _candidate_content_type(item: dict[str, Any]) -> str:
    raw = str(
        item.get("contentType")
        or item.get("questionType")
        or item.get("pollType")
        or ""
    ).strip()
    if not raw:
        return ""
    if raw in _POLL_TYPE_ALIASES:
        return _POLL_TYPE_ALIASES[raw]
    upper = raw.upper()
    if upper in _POLL_TYPE_ALIASES:
        return _POLL_TYPE_ALIASES[upper]
    return raw


def _normalize_candidate_options(item: dict[str, Any]) -> dict[str, Any]:
    """Accept sheet-style polls: question + string options → prompt + [{label, isCorrect}]."""
    out = dict(item)
    if not str(out.get("prompt") or "").strip() and out.get("question"):
        out["prompt"] = str(out["question"]).strip()
    options = out.get("options")
    if not isinstance(options, list) or not options:
        return out
    if all(isinstance(opt, dict) for opt in options):
        return out
    if not all(isinstance(opt, str) for opt in options):
        return out
    mapped = [{"label": opt.strip(), "isCorrect": False} for opt in options if str(opt).strip()]
    out["options"] = mapped
    if not str(out.get("format") or "").strip():
        out["format"] = FORMAT_POLL
    if not str(out.get("type") or "").strip():
        out["type"] = "predict" if len(mapped) == 2 else "pulse"
    return out


def _reject(
    item: dict[str, Any],
    slug: str,
    by_id: dict[str, dict[str, Any]],
    allowed_bank: str,
    *,
    today: date | None = None,
    content_lang: str = "en",
) -> str | None:
    key = normalize_slug(slug)
    cat = normalize_slug(str(item.get("category") or ""))
    if cat != key:
        return "category"
    fmt = _normalize_candidate_format(item)
    allowed_fmts = set(formats_for(key))
    if fmt not in allowed_fmts:
        return "format"
    # Text agent should not invent FTD image cards.
    if fmt == FORMAT_FIND_THE_DIFFERENCE:
        return "ftd-skip"
    question_type = _candidate_content_type(item)
    allowed_types = question_types(key, fmt) | set(types_for(key, fmt))
    if question_type not in allowed_types:
        return "question-type"
    moment_type = item.get("type")
    options = item.get("options")
    if not isinstance(options, list) or not all(isinstance(opt, dict) and str(opt.get("label") or "").strip() for opt in options):
        return "options"
    count = len(options)
    if moment_type == "predict" and count != 2:
        return "option-count"
    if moment_type == "pulse" and not (2 <= count <= 4):
        return "option-count"
    if moment_type not in {"predict", "pulse"}:
        return "card-type"
    labels = [str(opt["label"]).strip() for opt in options]
    prompt = str(item.get("prompt") or "").strip()
    if not prompt:
        return "prompt"
    lang = "hi" if content_lang == "hi" else "en"
    if has_arabic(prompt) or any(has_arabic(label) for label in labels):
        return "arabic-script"
    if lang == "en":
        if has_devanagari(prompt) or any(has_devanagari(label) for label in labels):
            return "english-script"
        if has_hinglish_latin(prompt) or any(has_hinglish_latin(label) for label in labels):
            return "english-hinglish"
    else:
        if not has_devanagari(prompt) or any(not has_devanagari(label) for label in labels):
            return "hindi-script"
        if has_hinglish_latin(prompt) or any(has_hinglish_latin(label) for label in labels):
            return "hindi-latin-mix"
    if any(not label for label in labels):
        return "options"
    topic_issue = off_category_topic_issue(key, prompt, labels)
    if topic_issue:
        return topic_issue
    correct = sum(1 for opt in options if opt.get("isCorrect"))
    if fmt in KNOWLEDGE_FORMATS and correct != 1:
        return "quiz-correct"
    if fmt in OPINION_FORMATS and correct:
        return "poll-correct"
    brief_id = item.get("briefId") or None
    if brief_id:
        brief = by_id.get(str(brief_id))
        if brief is None:
            return "brief"
        if question_type == "prediction":
            if not prediction_brief_open(brief, prompt, today):
                return "prediction-closed"
            if lang == "en" and "prediction" not in prompt.lower():
                return "prediction-label"
            if lang == "hi" and not _PREDICTION_HI_RE.search(prompt):
                return "prediction-label"
        allowed = json.dumps(brief)
        issues = fact_issues(prompt, labels, allowed, check_entities=lang == "en")
        if issues:
            return issues[0]
        return None

    if question_type == "prediction":
        return "brief"
    if fmt in KNOWLEDGE_FORMATS:
        if question_type in TREND_QUIZ_TYPES or question_type in set(types_for(key, fmt)):
            if volatile_fact_issue(prompt):
                return "volatile-fact"
            issues = fact_issues(prompt, labels, "", check_entities=False)
            if issues:
                return issues[0]
            # Freeform taxonomy types are allowed without bank copy.
            if question_type in TREND_QUIZ_TYPES or question_type not in _evergreen_types(key, FORMAT_QUIZ):
                return None
        if lang == "hi":
            return "hindi-bank-forbidden"
        if question_type not in _evergreen_types(key, FORMAT_QUIZ):
            # Allow freeform taxonomy trivia/quiz types.
            if question_type in set(types_for(key, fmt)):
                return None
            return "brief"
        if question_type in _evergreen_types(key, FORMAT_QUIZ) and set(labels) <= bank_labels(key, question_type):
            issues = fact_issues(prompt, labels, allowed_bank)
            if issues:
                return issues[0]
            return None
        if question_type in set(types_for(key, fmt)):
            return None
        return "options-not-in-bank"

    # Freeform opinion / this_or_that.
    issues = fact_issues(prompt, labels, "", check_entities=False)
    if issues:
        return issues[0]
    return None


def _evergreen_types(slug: str, fmt: str) -> set[str]:
    key = normalize_slug(slug)
    if fmt in OPINION_FORMATS or fmt == FORMAT_POLL:
        return {row[0] for row in POLLS.get(key, ())}
    return {row[0] for row in QUIZZES.get(key, ())}


def fill_evergreen(slug: str, cards: list[Card], need: int) -> list[Card]:
    """Top-up from the catalog when the English agent is short.

    Prefer under-filled formats from taxonomy mix. Sparse filler when agent mostly
    succeeded; full top-up when generation failed hard.
    """
    out = list(cards)
    have = {card.prompt for card in out}
    deficit = need - len(out)
    if deficit <= 0:
        return out
    if len(out) >= max(1, need // 2):
        evergreen_slots = min(deficit, max(2, need // 4))
    else:
        evergreen_slots = deficit
    targets = build_format_mix(slug, need)
    have_fmt: dict[str, int] = {}
    for card in out:
        have_fmt[card.format] = have_fmt.get(card.format, 0) + 1
    stock = list(generate_stock(slug))
    random.shuffle(stock)
    # Sort stock so under-filled formats come first.
    stock.sort(
        key=lambda c: (
            have_fmt.get(c.format, 0) - targets.get(c.format, 0),
            0 if c.format in KNOWLEDGE_FORMATS else 1,
        )
    )
    added = 0
    for card in stock:
        if added >= evergreen_slots:
            break
        if card.prompt in have:
            continue
        if any(near_duplicate_prompt(card.prompt, prev) for prev in have):
            continue
        out.append(card)
        have.add(card.prompt)
        have_fmt[card.format] = have_fmt.get(card.format, 0) + 1
        added += 1
    return out


def _verify_quiz_messages(cards: list[Card], *, today: date) -> list[dict[str, str]]:
    payload = {
        "today": today.isoformat(),
        "market": "India",
        "quizzes": [
            {
                "id": str(i),
                "category": card.category_slug,
                "prompt": card.prompt,
                "options": [
                    {
                        "label": str(opt.get("label") or ""),
                        "isCorrect": bool(opt.get("isCorrect")),
                    }
                    for opt in card.options
                ],
            }
            for i, card in enumerate(cards)
        ],
        "rules": [
            "You are a strict fact checker for a public quiz feed.",
            f"Today is {today.isoformat()}. Reject anything outdated as of today.",
            "Pass ONLY when the marked correct option is clearly true and distractors are clearly wrong.",
            "Fail when the answer is wrong, outdated, ambiguous, contested, or you are not highly confident.",
            "Fail current-office / 'who is the current X' quizzes unless you are certain the marked answer holds today.",
            'Return JSON only: {"results":[{"id":"0","verdict":"pass"|"fail","reason":"..."}]} .',
            "Every input id must appear exactly once in results.",
        ],
    }
    return [
        {
            "role": "system",
            "content": (
                "You verify quiz answer correctness for an Indian Gen Z feed. "
                "Be strict and fail-closed. Reply with a JSON object only."
            ),
        },
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def verify_quiz_facts(
    cards: list[Card],
    *,
    today: date | None = None,
    call_model: Any | None = None,
) -> tuple[list[Card], list[str]]:
    """LLM fact gate for freeform trend quizzes. Fail-closed on errors or uncertain answers."""
    today = today or datetime.now(UTC).date()
    trusted: list[Card] = []
    pending: list[Card] = []
    for card in cards:
        if needs_fact_verify(card):
            pending.append(card)
        else:
            trusted.append(card)
    if not pending:
        return cards, []

    caller = call_model or call_openai
    dropped: list[str] = []
    try:
        raw = caller(_verify_quiz_messages(pending, today=today))
    except Exception as exc:  # noqa: BLE001 — never publish unverified freeform quizzes
        for i, card in enumerate(pending):
            dropped.append(f"verify-error:{i}:{type(exc).__name__}:{card.prompt[:48]}")
        return trusted, dropped

    by_id: dict[str, dict[str, Any]] = {}
    for row in raw.get("results") or []:
        if isinstance(row, dict) and row.get("id") is not None:
            by_id[str(row["id"])] = row

    kept_pending: list[Card] = []
    for i, card in enumerate(pending):
        row = by_id.get(str(i))
        verdict = str((row or {}).get("verdict") or "").strip().lower()
        if verdict == "pass":
            kept_pending.append(card)
            continue
        reason = str((row or {}).get("reason") or "unverified").strip() or "unverified"
        dropped.append(f"fact-fail:{i}:{reason}:{card.prompt[:48]}")

    # Preserve original order: trusted + verified pending interleaved as in input.
    pending_ok = {id(card) for card in kept_pending}
    out: list[Card] = []
    for card in cards:
        if not needs_fact_verify(card):
            out.append(card)
        elif id(card) in pending_ok:
            out.append(card)
    return out, dropped


def agent_candidates(
    slug: str,
    need: int,
    briefs: list[dict[str, Any]] | None = None,
    *,
    avoid_prompts: list[str] | None = None,
    insights: dict[str, Any] | None = None,
    freshness_hours: int = DEFAULT_FRESHNESS_HOURS,
) -> list[Card]:
    """Ask OpenAI for English cards for one category. Raises MissingOpenAIKey when the key is absent.

    Pipeline: English generation → validate (EN purity) → fact gate → rank/diversify.
    Hindi cards come from agent_candidates_hi — never from localization.
    """
    return _agent_candidates_for_lang(
        slug,
        need,
        briefs,
        content_lang="en",
        avoid_prompts=avoid_prompts,
        insights=insights,
        freshness_hours=freshness_hours,
    )


def agent_candidates_hi(
    slug: str,
    need: int,
    briefs: list[dict[str, Any]] | None = None,
    *,
    avoid_prompts: list[str] | None = None,
    insights: dict[str, Any] | None = None,
    freshness_hours: int = DEFAULT_FRESHNESS_HOURS,
) -> list[Card]:
    """Ask OpenAI for original Hindi cards for one category.

    Pipeline: Hindi generation → validate (HI purity) → fact gate → rank/diversify.
    Does not top up from the English evergreen bank (that would mix languages).
    """
    return _agent_candidates_for_lang(
        slug,
        need,
        briefs,
        content_lang="hi",
        avoid_prompts=avoid_prompts,
        insights=insights,
        freshness_hours=freshness_hours,
    )


def _agent_candidates_for_lang(
    slug: str,
    need: int,
    briefs: list[dict[str, Any]] | None,
    *,
    content_lang: str,
    avoid_prompts: list[str] | None = None,
    insights: dict[str, Any] | None = None,
    freshness_hours: int = DEFAULT_FRESHNESS_HOURS,
) -> list[Card]:
    rows = briefs_for(slug, briefs)
    request = max(need, int(need * 2.0))
    avoid = list(avoid_prompts or [])
    lang = "hi" if content_lang == "hi" else "en"
    verified = merge_verified_trends(slug, rows)

    def _one_pass(extra_avoid: list[str], count: int) -> tuple[list[Card], list[str]]:
        messages = (
            _messages_hi(slug, count, rows, avoid_prompts=extra_avoid, insights=insights)
            if lang == "hi"
            else _messages(slug, count, rows, avoid_prompts=extra_avoid, insights=insights)
        )
        raw = call_openai(messages)
        batch, drop = validate_candidates(
            raw,
            slug,
            rows,
            freshness_hours=freshness_hours,
            avoid_prompts=extra_avoid,
            verified_trends=verified,
            content_lang=lang,
        )
        batch, fact_drop = verify_quiz_facts(batch)
        if fact_drop:
            drop.extend(fact_drop)
            print(f"FACT-GATE {lang}/{slug}: dropped {len(fact_drop)} unverified quiz(es)")
        return batch, drop

    cards, dropped = _one_pass(avoid, request)
    if len(cards) < need:
        shortfall = need - len(cards)
        stronger_avoid = avoid + [c.prompt for c in cards]
        refill, refill_drop = _one_pass(stronger_avoid, max(shortfall + 2, int(shortfall * 1.5)))
        dropped.extend(refill_drop)
        have = {c.prompt for c in cards}
        for card in refill:
            if card.prompt in have:
                continue
            if any(near_duplicate_prompt(card.prompt, prev) for prev in have):
                continue
            cards.append(card)
            have.add(card.prompt)
            if len(cards) >= need:
                break
    return rank_and_diversify(cards, need, insights=insights, slug=slug)


# Kept as a short alias for tests / older imports; full brief lives in hi_localize_prompt.py.
_HI_STYLE = HI_LOCALIZE_SYSTEM


def _localize_messages(cards: list[Card]) -> list[dict[str, str]]:
    """Narrow localization contract: English display text + stable ids only."""
    payload = {
        "task": "Localize these English Maja feed cards into Hindi for the Hindi feed.",
        "cards": [
            {
                "id": str(i),
                "prompt": card.prompt,
                "options": [
                    {"id": str(j), "label": str(opt.get("label") or "")}
                    for j, opt in enumerate(card.options)
                ],
            }
            for i, card in enumerate(cards)
        ],
        "rules": [
            'Return JSON only: {"translations":[{"id","promptHi","options":[{"id","labelHi"}]}]} .',
            "Legacy shape also accepted: optionsHi as a string array matching option order.",
            "options length/order must match input. id must match the input id.",
            "Return ONLY localization fields — never rewrite English prompt/labels or invent new options.",
            "Do not change meaning, facts, names, numbers, option count, option order, or which answer is correct.",
            "Every promptHi and labelHi must be Devanagari Hinglish (loanwords OK).",
            "No bilingual English/Hindi in one field. No Latin-script Hinglish.",
            "MOBILE: promptHi max ~70 characters; each labelHi max ~28 characters. Prefer short spoken Hindi over long literal translations.",
        ],
        "examples": [
            {
                "en": "What's your vibe for the next big Bollywood music release?",
                "hi": "अगली बड़ी बॉलीवुड फ़िल्म को लेकर कितने एक्साइटेड हो?",
                "optionsEn": ["Excited!", "Cautiously skeptical"],
                "optionsHi": ["बहुत ज़्यादा! 🔥", "ट्रेलर आने दो पहले 👀"],
            },
            {
                "en": "Midnight craving hits. Street stall or Maggi at home?",
                "hi": "रात को भूख लगी — स्ट्रीट फूड या घर की मैगी?",
                "optionsEn": ["Street stall", "Maggi at home"],
                "optionsHi": ["स्ट्रीट फूड 🔥", "घर की मैगी"],
            },
            {
                "en": "New trailer just dropped. Watch now or wait?",
                "hi": "नया ट्रेलर आया — क्या सीन है, अभी देखोगे?",
                "optionsEn": ["Watch now", "Wait for friends"],
                "optionsHi": ["अभी स्किप मत करो", "दोस्तों के साथ बाद में"],
            },
            {
                "en": "Worth the hype or overrated?",
                "hi": "हाइप के लायक है या ओवररेटेड?",
                "optionsEn": ["Worth the hype", "Overrated"],
                "optionsHi": ["हाइप के लायक", "ओवररेटेड"],
            },
        ],
    }
    return [
        {"role": "system", "content": HI_LOCALIZE_SYSTEM},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def _hi_labels_from_row(card: Card, row: dict[str, Any]) -> list[str | None]:
    """Map localization output onto option slots without trusting rewritten mechanics."""
    options_hi = row.get("optionsHi")
    if isinstance(options_hi, list) and len(options_hi) == len(card.options):
        return [str(hi or "").strip() or None for hi in options_hi]
    mapped = row.get("options")
    if isinstance(mapped, list):
        by_id: dict[str, str] = {}
        ordered: list[str | None] = []
        for entry in mapped:
            if not isinstance(entry, dict):
                continue
            oid = str(entry.get("id") if entry.get("id") is not None else len(ordered))
            label_hi = str(entry.get("labelHi") or "").strip()
            if label_hi:
                by_id[oid] = label_hi
            ordered.append(label_hi or None)
        if by_id and all(str(i) in by_id for i in range(len(card.options))):
            return [by_id[str(i)] for i in range(len(card.options))]
        if len(ordered) == len(card.options):
            return ordered
    return [None] * len(card.options)


def _apply_hi_row(card: Card, row: dict[str, Any] | None) -> Card:
    """Merge Hindi display fields only — game mechanics stay on the English card."""
    if not row:
        return card
    prompt_hi = str(row.get("promptHi") or "").strip() or None
    hi_labels = _hi_labels_from_row(card, row)
    new_options: list[dict[str, Any]] = []
    for opt, label_hi in zip(card.options, hi_labels, strict=True):
        mapped = {
            "label": str(opt.get("label") or ""),
            "isCorrect": bool(opt.get("isCorrect")),
        }
        # Preserve non-localization option metadata (e.g. imageKey) without trusting HI rewrite.
        for key, value in opt.items():
            if key in {"label", "isCorrect", "labelHi", "label_hi"}:
                continue
            mapped[key] = value
        if label_hi:
            mapped["labelHi"] = label_hi
        elif str(opt.get("labelHi") or "").strip():
            mapped["labelHi"] = str(opt.get("labelHi")).strip()
        new_options.append(mapped)
    return Card(
        type=card.type,
        category_slug=card.category_slug,
        format=card.format,
        question_type=card.question_type,
        prompt=card.prompt,
        options=new_options,
        scoring_mode=card.scoring_mode,
        tags=list(card.tags),
        ends_at=card.ends_at,
        brief_id=card.brief_id,
        event_date=card.event_date,
        facts_used=list(card.facts_used),
        prompt_hi=prompt_hi or card.prompt_hi,
    )


def localization_preserves_mechanics(before: Card, after: Card) -> bool:
    """True when localization only changed Hindi display fields."""
    if (
        before.type != after.type
        or before.category_slug != after.category_slug
        or before.format != after.format
        or before.question_type != after.question_type
        or before.prompt != after.prompt
        or before.brief_id != after.brief_id
        or before.scoring_mode != after.scoring_mode
        or len(before.options) != len(after.options)
    ):
        return False
    for left, right in zip(before.options, after.options, strict=True):
        if str(left.get("label") or "") != str(right.get("label") or ""):
            return False
        if bool(left.get("isCorrect")) != bool(right.get("isCorrect")):
            return False
    return True


def ensure_language_split(card: Card) -> Card:
    """Hard-separate languages: English fields Latin-only, Hindi fields Devanagari-only."""
    options: list[dict[str, Any]] = []
    for opt in card.options:
        row = dict(opt)
        row["label"] = strip_devanagari(str(opt.get("label") or ""))
        label_hi = prefer_devanagari(str(opt.get("labelHi") or "")) or None
        if label_hi:
            row["labelHi"] = label_hi
        elif "labelHi" in row:
            row.pop("labelHi", None)
        options.append(row)
    prompt_hi = prefer_devanagari(card.prompt_hi or "") or None
    return Card(
        type=card.type,
        category_slug=card.category_slug,
        format=card.format,
        question_type=card.question_type,
        prompt=strip_devanagari(card.prompt),
        options=options,
        scoring_mode=card.scoring_mode,
        tags=list(card.tags),
        ends_at=card.ends_at,
        brief_id=card.brief_id,
        event_date=card.event_date,
        facts_used=list(card.facts_used),
        prompt_hi=prompt_hi,
    )


def _merge_localized(card: Card, row: dict[str, Any] | None) -> Card:
    merged = ensure_language_split(_apply_hi_row(card, row))
    if not localization_preserves_mechanics(card, merged):
        # Never let a bad localization rewrite English mechanics — keep English card.
        return ensure_language_split(card)
    return merged


def localize_hi(cards: list[Card], *, rewrite: bool = True) -> list[Card]:
    """Write prompt_hi / labelHi via the Hindi localization expert.

    English stays source of truth. rewrite=True (default for the Hindi feed) always
    runs the expert over every card so published Hindi uses HI_LOCALIZE_SYSTEM.
    rewrite=False only fills gaps. Failed rows can be retried without regenerating English.
    """
    pending = list(cards) if rewrite else [card for card in cards if card.needs_hi()]
    if not pending:
        return [ensure_language_split(card) for card in cards]
    try:
        raw = call_openai(_localize_messages(pending))
    except MissingOpenAIKey:
        return [ensure_language_split(card) for card in cards]
    except Exception:  # noqa: BLE001 — keep existing English/Hindi if translation fails
        return [ensure_language_split(card) for card in cards]
    by_id: dict[str, dict[str, Any]] = {}
    for row in raw.get("translations") or []:
        if isinstance(row, dict) and row.get("id") is not None:
            by_id[str(row["id"])] = row
    out: list[Card] = []
    pending_i = 0
    retry_cards: list[Card] = []
    retry_out_indexes: list[int] = []
    for card in cards:
        if not rewrite and not card.needs_hi():
            out.append(ensure_language_split(card))
            continue
        row = by_id.get(str(pending_i))
        pending_i += 1
        merged = _merge_localized(card, row)
        out.append(merged)
        if merged.needs_hi() or not merged.has_complete_hi():
            retry_cards.append(card)
            retry_out_indexes.append(len(out) - 1)
    # Targeted Hindi retry only — never regenerate English content for localization misses.
    if retry_cards:
        try:
            retry_raw = call_openai(_localize_messages(retry_cards))
            retry_by_id: dict[str, dict[str, Any]] = {}
            for row in retry_raw.get("translations") or []:
                if isinstance(row, dict) and row.get("id") is not None:
                    retry_by_id[str(row["id"])] = row
            for local_i, out_i in enumerate(retry_out_indexes):
                merged = _merge_localized(retry_cards[local_i], retry_by_id.get(str(local_i)))
                if merged.has_complete_hi():
                    out[out_i] = merged
        except Exception:  # noqa: BLE001 — leave first-pass results
            pass
    return out


def localize_hi_dicts(moments: list[dict[str, Any]], *, rewrite: bool = True) -> list[dict[str, Any]]:
    """Write promptHi / labelHi on publish payloads (agent + meme batches) via the expert."""
    if rewrite:
        pending_idx = list(range(len(moments)))
    else:
        pending_idx = [
            i
            for i, m in enumerate(moments)
            if not str(m.get("promptHi") or m.get("prompt_hi") or "").strip()
            or any(
                isinstance(o, dict) and not str(o.get("labelHi") or o.get("label_hi") or "").strip()
                for o in (m.get("options") or [])
                if not isinstance(o, str)
            )
        ]
    if not pending_idx:
        return moments
    stubs: list[Card] = []
    for i in pending_idx:
        m = moments[i]
        options: list[dict[str, Any]] = []
        for opt in m.get("options") or []:
            if isinstance(opt, str):
                options.append({"label": opt, "isCorrect": False})
            else:
                options.append(
                    {
                        "label": str(opt.get("label") or opt.get("text") or ""),
                        "isCorrect": bool(opt.get("isCorrect")),
                    }
                )
        stubs.append(
            Card(
                type=str(m.get("type") or "predict"),
                category_slug=str(m.get("categorySlug") or ""),
                format=(
                    "quiz"
                    if {"quiz", "trivia"} & set(m.get("tags") or [])
                    else "poll"
                ),
                question_type="opinion",
                prompt=str(m.get("prompt") or ""),
                options=options,
                scoring_mode=str(m.get("scoringMode") or "none"),
                tags=list(m.get("tags") or []),
            )
        )
    filled = localize_hi(stubs, rewrite=True)
    out = list(moments)
    for stub_i, card in enumerate(filled):
        idx = pending_idx[stub_i]
        if not card.prompt_hi and not any(opt.get("labelHi") for opt in card.options):
            continue
        row = dict(out[idx])
        if card.prompt_hi:
            row["promptHi"] = card.prompt_hi
        new_options: list[Any] = []
        src_opts = list(row.get("options") or [])
        for j, opt in enumerate(src_opts):
            hi = card.options[j].get("labelHi") if j < len(card.options) else None
            if isinstance(opt, str):
                new_options.append({"label": opt, **({"labelHi": hi} if hi else {})})
            else:
                mapped = dict(opt)
                if hi:
                    mapped["labelHi"] = hi
                new_options.append(mapped)
        row["options"] = new_options
        out[idx] = row
    return out
