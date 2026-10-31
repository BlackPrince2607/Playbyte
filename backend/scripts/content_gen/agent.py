"""OpenAI agent that proposes poll and quiz cards. A gate drops anything the catalog cannot support.

MAJA content generation uses two language stages:

1. English Content Agent — creates game content in English only (prompt / label).
2. Hindi Localization Agent — writes promptHi / labelHi after English is finalized.

Both layers belong to one canonical card. The English agent must never own final Hindi fields.
The Hindi agent must never change game mechanics (format, options, isCorrect, briefId, …).
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
    has_devanagari,
    has_hinglish_latin,
    load_briefs,
    prefer_devanagari,
    question_types,
    strip_devanagari,
)
from scripts.content_gen.hi_localize_prompt import HI_LOCALIZE_SYSTEM

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
    r"which\s+(?:\w+\s+){0,3}(?:actor|actress|player|singer|team|movie|film)\s+do\s+you\s+(?:love|like|prefer)\b"
    r")"
)
_HI_FIELD_KEYS = frozenset({"promptHi", "prompt_hi", "labelHi", "label_hi", "optionsHi", "options_hi"})

EN_SYSTEM = (
    "You are the English Content Generation Agent for MAJA, an Indian interactive swipe feed.\n\n"
    "Your job is to create fresh, highly swipeable quiz and poll cards for ONE requested category.\n\n"
    "Generate natural English only.\n\n"
    "Never generate:\n"
    "- Hindi\n"
    "- Hinglish\n"
    "- Devanagari\n"
    "- Hindi transliteration\n"
    "- promptHi\n"
    "- labelHi\n"
    "- optionsHi\n\n"
    "A separate Hindi localization agent creates all Hindi/Hinglish display fields after English "
    "content has been validated.\n\n"
    "Do not translate or localize.\n\n"
    "Your responsibility is to create the best possible English game content.\n\n"
    "Optimize for: immediate comprehension, answerability, curiosity, emotional reaction, "
    "willingness to choose, and willingness to keep swiping. "
    "Every card should feel interactive within about three seconds — not like a school exam, "
    "generic survey, news article, or random fact dump.\n\n"
    "Reply with a JSON object only: {\"candidates\": [...]} . "
    "Each candidate has format, category, questionType, type, prompt, options, briefId. "
    "options are {label, isCorrect}. briefId is null unless the card uses a verified brief."
)
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
    """Tell the model what this category covers — especially sports vs cricket."""
    if slug == "sports":
        return {
            "label": "Sports (Non-Cricket)",
            "include": [
                "football/soccer",
                "hockey",
                "badminton",
                "tennis",
                "kabaddi",
                "athletics",
                "F1",
                "NBA / Olympics topics Indians follow",
                "chess",
            ],
            "exclude": [
                "cricket",
                "IPL",
                "T20",
                "ODI",
                "BCCI",
                "wickets",
                "batting/bowling cricket terms",
                "cricket players or Indian cricket takes",
            ],
            "note": "Cricket has its own category slug 'cricket'. Never write cricket cards for sports.",
        }
    if slug == "cricket":
        return {
            "label": "Cricket",
            "include": [
                "IPL",
                "international cricket",
                "T20 / ODI / Tests",
                "players",
                "rules",
                "formats",
                "upcoming fixtures",
            ],
            "exclude": ["football and other non-cricket sports as the main topic"],
        }
    return {"label": slug}


def _category_rules(slug: str) -> list[str]:
    if slug == "sports":
        return [
            "SCOPE (critical): category sports means Sports (Non-Cricket) ONLY.",
            "NEVER mention cricket, IPL, T20, ODI, BCCI, wickets, batting, bowling, or cricket players.",
            "BAD sports card: 'How do you feel about the current state of Indian cricket?'.",
            "GOOD sports mix: football derby takes, kabaddi, badminton, hockey, F1, Olympics, chess — rotate sports across the batch.",
        ]
    if slug == "cricket":
        return [
            "SCOPE: this is the cricket category — IPL, internationals, formats, rules, and debate takes.",
            "Do NOT use football, kabaddi, F1, NBA, or other non-cricket sports as the primary topic.",
            "BAD name spam: three cards all about Sanju Samson / Kohli / Rohit. Rotate subjects or ask knowledge questions with no star name.",
            "GOOD cricket mix: 'How many balls in an over?', 'What does DRS stand for?', one debate poll, one upcoming-match take — different angles.",
            "OK freeform quiz: 'How many players take the field for one side in cricket?'.",
        ]
    return []


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
                "brief": brief,
            }
        )
    return out


def build_shared_system_rules(today: str, quiz_target: int, poll_target: int) -> list[str]:
    return [
        "Return JSON with a candidates array. English fields only — never promptHi, labelHi, or optionsHi.",
        "Every candidate category must equal the requested category.",
        "Stay inside categoryScope — never write a card that belongs in a different onboarding category.",
        f"Today is {today}. Prefer verified live/upcoming India context from verifiedTrends when present.",
        "Never invent a trend. Never claim something is trending without verifiedTrends / briefs support.",
        f"MIX (soft target): about {quiz_target} QUIZZES and {poll_target} polls. Quality beats quotas — do not pad with weak cards.",
        "Prefer trivia / who / which quizzes with one clear correct answer over soft opinion polls.",
        "Predictions: at most ~10% of the batch, and only for genuinely upcoming events with briefId.",
        "Not formal survey speak. Not essays. Spicy but friendly. Understandable in ~3 seconds.",
        "A quiz has exactly one correct option. Polls must set isCorrect false on every option.",
        "Incorrect quiz options must be plausible — no absurd distractors, no 'All/None of the above'.",
        "Two options use type predict. Three or four use type pulse.",
        "Do not use gambling words.",
    ]


def build_interaction_rules() -> list[str]:
    return [
        "INTERACTION DIVERSITY (critical): vary patterns across the batch — knowledge challenge, who/which, "
        "A vs B debate, hot take, surprising fact, upcoming prediction (only if valid), comparison, nostalgia, "
        "category-specific formats. Do not repeat the same interaction pattern.",
        "BAD batch: ten similar preference polls ('How do you watch movies?', 'Favourite snack?', 'Happy ending or cliffhanger?').",
        "BAD lazy polls: 'Who is your favourite…?', 'Do you like X?', 'Which do you prefer?' unless timely and specific.",
        "GOOD polls create tension, identity, disagreement, or a meaningful choice (A vs B, worth the hype?, underrated/overrated).",
        "GOOD quizzes are knowable, surprising, recognizable, and timely when trend-based.",
        "GOOD batch: mix of fact trivia, who/which quizzes, and a few sharp debate polls on DIFFERENT topics.",
        "One verified trend should normally produce ONE strong angle — not five paraphrases.",
        "Possible angles when using a trend: FACT, CHOICE, DEBATE, REACTION, CONTEXT, IDENTIFY, PREDICTION (upcoming only).",
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
        "Prioritize verifiedTrends that are LIVE or UPCOMING for THIS category. Skip party politics.",
        "CLOSED / PAST EVENTS (critical): NEVER ask users to predict the outcome of a match, tournament, season, "
        "election, award, or final that has already concluded as of today.",
        f"BAD past prediction: 'Who will win IPL 2026?' when IPL {today[:4]} is already over by {today}.",
        "BAD past prediction: 'Prediction: who wins the final?' for a final that already happened.",
        "OK on past events: opinion/debate only ('Fair Player of the Match?', 'Was that the right call?').",
        "OK predictions: only UPCOMING fixtures (tonight / this weekend / next match) that have not started — "
        "and only with briefId when questionType is prediction.",
        "If unsure whether an event is still open, write an opinion/debate/hot poll instead of a prediction.",
        "Polls use questionType opinion, debate, or hot for freeform India-trend options.",
        "Trend quizzes use questionType trivia, who, or which with STABLE well-known facts only (rules, definitions, permanent records).",
        "NEVER write a freeform quiz about who currently holds an office (CM, PM, president, captain, coach, CEO) — those need a verified briefId.",
        "BAD freeform quiz: 'Who is the current Chief Minister of Delhi?' / 'Who is India's PM right now?'.",
        "OK freeform quiz: stable rules/definitions for THIS category (e.g. 'What does OTT stand for?' for movies/tech).",
        "Time-sensitive politics/news facts belong in briefs — or write an opinion/debate poll instead of a quiz.",
        "A prediction prompt must contain the word Prediction, set briefId, and the brief must allow it.",
        "Bank quizzes (evergreen types not in trendQuizTypes) must copy prompt and options from the evergreen bank.",
        "Event copy may use only names and numbers that appear in that brief / verified trend facts.",
    ]


def build_english_purity_rules() -> list[str]:
    return [
        "ENGLISH ONLY (critical): prompt and option.label must be natural English. Latin script only.",
        "Never generate Hindi, Hinglish, Devanagari, Hindi transliteration, promptHi, labelHi, or optionsHi.",
        "NO Hinglish in English fields: never use Hindi words or Latin transliteration "
        "(yaar, kya, kitna, bahut, nahi, scene hai, full on, etc.).",
        "English must read like English a fluent speaker would write — not Hindi written in Latin letters.",
        "Indian names, brand names, movie titles, and proper nouns in English are fine.",
        "A separate Hindi localization agent will create promptHi / labelHi after validation.",
    ]


def build_output_contract(need: int) -> list[str]:
    return [
        "Output schema per candidate: format, category, questionType, type, prompt, options[{label,isCorrect}], briefId.",
        "Do NOT include promptHi, labelHi, or optionsHi — they are forbidden in this stage.",
        f"Return about {need} candidates — fill the feed; quantity with quality.",
    ]


def _messages(
    slug: str,
    need: int,
    briefs: list[dict[str, Any]],
    avoid_prompts: list[str] | None = None,
    insights: dict[str, Any] | None = None,
) -> list[dict[str, str]]:
    today_date = datetime.now(UTC).date()
    today = today_date.isoformat()
    # Trivia-first mix: most cards should be quizzes; polls stay for debate energy.
    quiz_target = max(1, round(need * 0.6))
    poll_target = max(1, need - quiz_target)
    trends = normalize_verified_trends(briefs, today=today_date)
    payload = {
        "category": slug,
        "categoryScope": _category_scope(slug),
        "need": need,
        "today": today,
        "mix": {
            "quizzes": quiz_target,
            "polls": poll_target,
            "predictionsMaxShare": 0.1,
            "preferQuizTypes": ["trivia", "who", "which"],
            "preferPollTypes": sorted(TREND_POLL_TYPES),
        },
        "market": "India English feed (metros + Tier-2). Hindi/Hinglish is a separate localization stage.",
        "pollQuestionTypes": sorted(question_types(slug, "poll")),
        "quizQuestionTypes": sorted(question_types(slug, "quiz")),
        "trendQuizTypes": sorted(TREND_QUIZ_TYPES),
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
            "englishGood": [
                "Midnight craving hits. Street food or Maggi at home?",
                "New trailer just dropped. Watch now or wait for friends?",
                "Rain mid-commute. Grab a cab or tough it out?",
                "DRS reviews left. Burn one now or save it?",
                "Worth the hype or overrated — this weekend's release?",
            ],
            "englishBad": [
                "Kya scene hai for the release?",
                "Kitne excited ho for the match?",
                "What's your vibe yaar?",
                "What is your preferred late-night dining option?",
                "Who is your favourite actor?",
                "Do you like cricket?",
                "Which do you prefer?",
            ],
        },
        "rules": [
            *build_shared_system_rules(today, quiz_target, poll_target),
            *build_interaction_rules(),
            *build_uniqueness_rules(),
            *build_event_fact_rules(today),
            *build_english_purity_rules(),
            *build_output_contract(need),
            *_category_rules(slug),
        ],
    }
    return [
        {"role": "system", "content": EN_SYSTEM},
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
    text = " ".join([prompt or "", *(labels or [])]).strip()
    if not text:
        return None
    if slug == "sports":
        if _CRICKET_TOPIC_RE.search(text):
            return "cricket-in-sports"
        return None
    if slug == "cricket":
        # Non-cricket sport as the main topic (no cricket anchors) belongs in sports.
        if _NON_CRICKET_SPORT_RE.search(text) and not _CRICKET_TOPIC_RE.search(text):
            return "non-cricket-in-cricket"
        return None
    return None


def lazy_poll_issue(fmt: str, prompt: str) -> str | None:
    """Reject generic favourite/prefer survey prompts that make the feed feel empty."""
    if fmt != "poll":
        return None
    if _LAZY_POLL_RE.search(prompt or ""):
        return "lazy-poll"
    return None


def interaction_pattern(card: Card) -> str:
    """Coarse interaction fingerprint used for batch diversity."""
    q = (card.question_type or "").lower()
    prompt = (card.prompt or "").lower()
    if card.format == "quiz":
        if q in {"who", "which", "trivia", "stat"}:
            return f"quiz:{q}"
        return f"quiz:{q or 'other'}"
    if "prediction" in prompt or q == "prediction":
        return "poll:prediction"
    if " or " in prompt or " vs " in prompt or "versus" in prompt:
        return "poll:avb"
    if q in {"debate", "hot", "opinion"}:
        return f"poll:{q}"
    return f"poll:{q or 'other'}"


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
) -> float:
    """Rank recognisable + interactive + fresh + diverse over raw trend score alone."""
    score = 0.0
    if card.format == "quiz":
        score += 3.0
        if card.question_type in TREND_QUIZ_TYPES:
            score += 1.5
    elif card.question_type in {"debate", "hot"}:
        score += 2.0
    elif card.question_type == "prediction":
        score += 1.0
    else:
        score += 1.5
    if card.brief_id:
        score += 2.5
    prompt = card.prompt or ""
    words = len(prompt.split())
    if 6 <= words <= 22:
        score += 1.0
    elif words > 28:
        score -= 1.0
    if lazy_poll_issue(card.format, prompt):
        score -= 5.0
    pattern = interaction_pattern(card)
    if used_patterns and pattern in used_patterns:
        score -= 1.5
    lessons = " ".join(str(x) for x in (insights or {}).get("lessons") or []).lower()
    if lessons:
        if "debate" in lessons and card.question_type == "debate":
            score += 0.5
        if "trivia" in lessons and card.format == "quiz":
            score += 0.5
        if "short" in lessons and words <= 14:
            score += 0.3
    return score


def rank_and_diversify(
    cards: list[Card],
    need: int,
    *,
    insights: dict[str, Any] | None = None,
) -> list[Card]:
    """Prefer strong interactive cards while keeping interaction-pattern diversity."""
    if len(cards) <= need:
        return list(cards)
    remaining = list(cards)
    chosen: list[Card] = []
    used_patterns: set[str] = set()
    while remaining and len(chosen) < need:
        remaining.sort(
            key=lambda c: score_candidate(c, insights=insights, used_patterns=used_patterns),
            reverse=True,
        )
        pick = remaining.pop(0)
        chosen.append(pick)
        used_patterns.add(interaction_pattern(pick))
    return chosen


def needs_fact_verify(card: Card) -> bool:
    """Freeform trend quizzes without a brief must pass an LLM fact gate before publish."""
    return (
        card.format == "quiz"
        and card.question_type in TREND_QUIZ_TYPES
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
) -> tuple[list[Card], list[str]]:
    """Keep candidates that match the catalog. Drop the rest with a short reason."""
    now = now or datetime.now(UTC)
    today = now.date()
    rows = briefs_for(slug, briefs if briefs is not None else load_briefs())
    by_id = {str(row["id"]): row for row in rows}
    allowed_bank = bank_text(slug)
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
        # English stage must not trust accidental Hindi fields from the model.
        cleaned = _english_only_fields(discard_localization_fields(item))
        reason = _reject(cleaned, slug, by_id, allowed_bank, today=today)
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
        if names & avoid_names and fmt != "quiz":
            # Opinion/debate about the same star again — prefer knowledge trivia instead.
            dropped.append(f"{index}:avoid-name")
            continue
        brief_id = cleaned.get("briefId") or None
        brief = by_id.get(str(brief_id)) if brief_id else None
        options = cleaned["options"]
        mapped_options = [
            {"label": str(opt["label"]).strip(), "isCorrect": bool(opt.get("isCorrect"))}
            for opt in options
        ]
        card = Card(
            type=cleaned["type"],
            category_slug=slug,
            format=fmt,
            question_type=str(cleaned["questionType"]),
            prompt=prompt,
            options=mapped_options,
            scoring_mode="correct_option" if fmt == "quiz" else "none",
            tags=["quiz" if fmt == "quiz" else "poll"],
            ends_at=_ends_at(brief, now, default_hours=freshness_hours),
            brief_id=str(brief_id) if brief_id else None,
            event_date=str(brief.get("eventDate") or "") if brief else None,
            facts_used=list(brief.get("facts") or []) if brief else [],
            prompt_hi=None,
        )
        pattern = interaction_pattern(card)
        # Soft cap: allow at most a few cards sharing the exact same interaction fingerprint.
        if pattern_counts.get(pattern, 0) >= 3 and len(kept_prompts) >= 4:
            dropped.append(f"{index}:pattern-repeat")
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


def _reject(
    item: dict[str, Any],
    slug: str,
    by_id: dict[str, dict[str, Any]],
    allowed_bank: str,
    *,
    today: date | None = None,
) -> str | None:
    if item.get("category") != slug:
        return "category"
    fmt = item.get("format")
    if fmt not in {"poll", "quiz"}:
        return "format"
    question_type = str(item.get("questionType") or "")
    if question_type not in question_types(slug, fmt):
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
    # Guardrail if strip left junk / model ignored the language split.
    if has_devanagari(prompt) or any(has_devanagari(label) for label in labels):
        return "english-script"
    if has_hinglish_latin(prompt) or any(has_hinglish_latin(label) for label in labels):
        return "english-hinglish"
    if any(not label for label in labels):
        return "options"
    topic_issue = off_category_topic_issue(slug, prompt, labels)
    if topic_issue:
        return topic_issue
    correct = sum(1 for opt in options if opt.get("isCorrect"))
    if fmt == "quiz" and correct != 1:
        return "quiz-correct"
    if fmt == "poll" and correct:
        return "poll-correct"
    brief_id = item.get("briefId") or None
    if brief_id:
        brief = by_id.get(str(brief_id))
        if brief is None:
            return "brief"
        if question_type == "prediction":
            if not prediction_brief_open(brief, prompt, today):
                return "prediction-closed"
            if "prediction" not in prompt.lower():
                return "prediction-label"
        allowed = json.dumps(brief)
        issues = fact_issues(prompt, labels, allowed)
        if issues:
            return issues[0]
        return None

    if question_type == "prediction":
        return "brief"
    if fmt == "quiz":
        if question_type in TREND_QUIZ_TYPES:
            # Freeform trivia: no current-office / time-sensitive claims without a brief.
            if volatile_fact_issue(prompt):
                return "volatile-fact"
            issues = fact_issues(prompt, labels, "", check_entities=False)
            if issues:
                return issues[0]
            return None
        if question_type not in _evergreen_types(slug, fmt):
            return "brief"
        if not set(labels) <= bank_labels(slug, question_type):
            return "options-not-in-bank"
        issues = fact_issues(prompt, labels, allowed_bank)
        if issues:
            return issues[0]
        return None

    # Freeform trend / opinion poll — options need not come from the bank.
    issues = fact_issues(prompt, labels, "", check_entities=False)
    if issues:
        return issues[0]
    return None


def _evergreen_types(slug: str, fmt: str) -> set[str]:
    if fmt == "poll":
        return {row[0] for row in POLLS[slug]}
    return {row[0] for row in QUIZZES[slug]}


def fill_evergreen(slug: str, cards: list[Card], need: int) -> list[Card]:
    """Top-up from the catalog when the English agent is short.

    Prefer quizzes. If the agent already delivered most of the batch, keep evergreen
    sparse; if the batch is empty/very short, fill the full deficit so publish stays reliable.
    """
    out = list(cards)
    have = {card.prompt for card in out}
    deficit = need - len(out)
    if deficit <= 0:
        return out
    # Sparse filler when agent mostly succeeded; full top-up when generation failed hard.
    if len(out) >= max(1, need // 2):
        evergreen_slots = min(deficit, max(2, need // 4))
    else:
        evergreen_slots = deficit
    stock = list(generate_stock(slug))
    polls = [card for card in stock if card.format == "poll"]
    quizzes = [card for card in stock if card.format != "poll"]
    random.shuffle(polls)
    random.shuffle(quizzes)
    added = 0
    for card in quizzes + polls:
        if added >= evergreen_slots:
            break
        if card.prompt in have:
            continue
        if any(near_duplicate_prompt(card.prompt, prev) for prev in have):
            continue
        out.append(card)
        have.add(card.prompt)
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
    """Ask OpenAI for one category. Raises MissingOpenAIKey when the key is absent.

    Pipeline: English generation → validate → fact gate → rank/diversify.
    Hindi localization is a separate later stage (localize_hi).
    """
    rows = briefs_for(slug, briefs)
    # Ask for a little extra so past-outcome / near-duplicate drops still leave a full batch.
    request = max(need, int(need * 1.35))
    avoid = list(avoid_prompts or [])
    cards: list[Card] = []
    dropped: list[str] = []

    def _one_pass(extra_avoid: list[str], count: int) -> tuple[list[Card], list[str]]:
        raw = call_openai(
            _messages(slug, count, rows, avoid_prompts=extra_avoid, insights=insights)
        )
        batch, drop = validate_candidates(
            raw,
            slug,
            rows,
            freshness_hours=freshness_hours,
            avoid_prompts=extra_avoid,
        )
        batch, fact_drop = verify_quiz_facts(batch)
        if fact_drop:
            drop.extend(fact_drop)
            print(f"FACT-GATE {slug}: dropped {len(fact_drop)} unverified quiz(es)")
        return batch, drop

    cards, dropped = _one_pass(avoid, request)
    # Targeted top-up only when the first pass is short — do not regenerate a full batch.
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
    ranked = rank_and_diversify(cards, need, insights=insights)
    return ranked


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
                format="quiz" if "quiz" in (m.get("tags") or []) else "poll",
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
