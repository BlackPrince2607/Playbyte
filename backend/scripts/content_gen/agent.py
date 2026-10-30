"""OpenAI agent that proposes poll and quiz cards. A gate drops anything the catalog cannot support."""

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
    TREND_QUIZ_TYPES,
    Card,
    bank_labels,
    bank_text,
    briefs_for,
    fact_issues,
    generate_stock,
    has_devanagari,
    load_briefs,
    prefer_devanagari,
    question_types,
    strip_devanagari,
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


def _messages(
    slug: str,
    need: int,
    briefs: list[dict[str, Any]],
    avoid_prompts: list[str] | None = None,
    insights: dict[str, Any] | None = None,
) -> list[dict[str, str]]:
    today = datetime.now(UTC).date().isoformat()
    poll_target = max(1, round(need * 0.7))
    quiz_target = max(0, need - poll_target)
    payload = {
        "category": slug,
        "need": need,
        "today": today,
        "mix": {"polls": poll_target, "quizzes": quiz_target},
        "market": "India (bilingual product: separate English layer + separate Hindi layer; Gen Z / millennial metros + Tier-2)",
        "pollQuestionTypes": sorted(question_types(slug, "poll")),
        "quizQuestionTypes": sorted(question_types(slug, "quiz")),
        "trendQuizTypes": sorted(TREND_QUIZ_TYPES),
        "evergreenBank": bank_text(slug),
        "briefs": briefs,
        "avoidPrompts": list(avoid_prompts or [])[:120],
        "engagementInsights": insights or {},
        "voiceExamples": {
            "englishGood": [
                "Midnight craving hits. Street food or Maggi at home?",
                "New trailer just dropped. Watch now or wait for friends?",
                "Rain mid-commute. Grab a cab or tough it out?",
            ],
            "englishBad": [
                "Kya scene hai for the release?",
                "Kitne excited ho for the match?",
                "What's your vibe yaar?",
                "What is your preferred late-night dining option?",
            ],
            "hindiGood": [
                {
                    "promptHi": "रात को भूख लगी तो क्या लोगे?",
                    "optionsHi": ["स्ट्रीट फूड 🔥", "घर की मैगी"],
                },
                {
                    "promptHi": "नया ट्रेलर आया — अभी देखोगे?",
                    "optionsHi": ["अभी देखना है", "दोस्तों के साथ बाद में"],
                },
            ],
            "hindiBad": [
                {
                    "promptHi": "What's your vibe for the trailer?",
                    "optionsHi": ["Excited!", "Wait and see"],
                },
                {
                    "promptHi": "Excited! / कितने एक्साइटेड हो?",
                    "optionsHi": ["Very much", "बहुत ज़्यादा"],
                },
            ],
        },
        "rules": [
            "Return JSON with a candidates array.",
            "Every candidate category must equal the requested category.",
            f"Today is {today}. Every card must feel current — what India is talking about in this category right now.",
            f"MIX: aim for about {poll_target} polls and {quiz_target} quizzes (poll-heavy; polls drive the swipe feed).",
            "Write brand-new prompts. Never reuse or lightly rephrase anything in avoidPrompts.",
            "UNIQUENESS (critical): each candidate must cover a DIFFERENT topic/angle — not the same question with new wording.",
            "BAD uniqueness: 'Kohli or Rohit for captain?' and 'Who should captain — Kohli or Rohit?'.",
            "Vary subjects, stakes, and questionType across the batch so the feed does not feel repetitive.",
            "Prioritize India trends that are LIVE or UPCOMING: cricket fixtures still to play, Bollywood releases, OTT drops, campus slang, food debates, gaming, reels, tech launches Indians care about. Skip party politics.",
            "CLOSED / PAST EVENTS (critical): NEVER ask users to predict the outcome of a match, tournament, season, election, award, or final that has already concluded as of today.",
            f"BAD past prediction: 'Who will win IPL 2026?' when IPL {today[:4]} is already over by {today}.",
            "BAD past prediction: 'Prediction: who wins the final?' for a final that already happened.",
            "OK on past events: opinion/debate only ('Fair Player of the Match?', 'Was that the right call?').",
            "OK predictions: only UPCOMING fixtures (tonight / this weekend / next match) that have not started — and only with briefId when questionType is prediction.",
            "If unsure whether an event is still open, write an opinion/debate/hot poll instead of a prediction.",
            "Learn from engagementInsights: copy the energy of hits (format, length, debate heat); do not clone miss prompts; follow lessons.",
            "TWO LANGUAGE LAYERS (critical): each card has an English set AND a Hindi set. They are independent copy — not mixed, not Hinglish.",
            "ENGLISH (prompt + option.label): natural English only. Short, second-person, swipeable. Latin script only.",
            "NO Hinglish in English fields: never use Hindi words or transliteration (yaar, kya, kitna, bahut, nahi, scene hai, full on, etc.).",
            "English must read like English a fluent speaker would write — not an English translation of a Hindi line, not Hindi written in Latin letters.",
            "HINDI (promptHi + option.labelHi): natural spoken Devanagari Hindi, written as a Hindi speaker would ask a friend.",
            "Hindi is NOT a word-for-word translation of the English line — rewrite the same idea in natural Hindi.",
            "Hindi fields: Devanagari only (familiar loanwords in Devanagari OK: फ़िल्म, ट्रेलर, मैच, क्विज़). No English sentences.",
            "Never put both languages in one field (no 'Excited! / एक्साइटेड').",
            "Not formal survey speak. Not essays. Spicy but friendly.",
            "Polls use questionType opinion, debate, or hot for freeform India-trend options.",
            "Trend quizzes use questionType trivia, who, or which with STABLE well-known facts only (rules, definitions, permanent records).",
            "NEVER write a freeform quiz about who currently holds an office (CM, PM, president, captain, coach, CEO) — those need a verified briefId.",
            "BAD freeform quiz: 'Who is the current Chief Minister of Delhi?' / 'Who is India's PM right now?'.",
            "OK freeform quiz: 'How many players take the field for one side in cricket?' / 'What does OTT stand for?'.",
            "Time-sensitive politics/news facts belong in briefs — or write an opinion/debate poll instead of a quiz.",
            "A prediction prompt must contain the word Prediction, set briefId, and the brief must allow it.",
            "Bank quizzes (evergreen types not in trendQuizTypes) must copy prompt and options from the evergreen bank.",
            "Event copy may use only names and numbers that appear in that brief.",
            "A quiz has exactly one correct option. Polls must set isCorrect false on every option.",
            "Two options use type predict. Three or four use type pulse.",
            "Do not use gambling words.",
            "Every candidate MUST include promptHi and labelHi on every option. Never leave Hindi empty.",
            f"Return about {need} candidates — fill the feed; quantity with quality.",
        ],
    }
    return [
        {
            "role": "system",
            "content": (
                "You create fresh Maja poll and quiz cards for one category for an Indian swipe feed. "
                "Bias hard toward LIVE and UPCOMING India trends. Prefer interactive polls over quizzes. "
                "Never predict outcomes of events that are already over. "
                "Never ship freeform quizzes about current officeholders or other facts that change — use briefs or opinion polls. "
                "Never paraphrase avoidPrompts or repeat the same question with different sentences. "
                "TWO LAYERS: prompt/label = natural English only (no Hinglish, no Hindi transliteration); "
                "promptHi/labelHi = natural Devanagari Hindi rewritten for Hindi speakers (not a literal translation). "
                "Never mix languages in one field. "
                "Reply with a JSON object only: {\"candidates\": [...]} . "
                "Each candidate has format, category, questionType, type, prompt, promptHi, options, briefId. "
                "options are {label, labelHi, isCorrect}. briefId is null unless the card uses a verified brief."
            ),
        },
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


def near_duplicate_prompt(a: str, b: str, *, threshold: float = 0.72) -> bool:
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
    avoid = [str(p).strip() for p in (avoid_prompts or []) if str(p).strip()]
    for index, item in enumerate(raw.get("candidates") or []):
        if not isinstance(item, dict):
            dropped.append(f"{index}:shape")
            continue
        # English fields must stay Latin-only; Devanagari belongs in promptHi / labelHi.
        cleaned = _english_only_fields(item)
        reason = _reject(cleaned, slug, by_id, allowed_bank, today=today)
        if reason:
            dropped.append(f"{index}:{reason}")
            continue
        prompt = str(cleaned["prompt"]).strip()
        if past_outcome_issue(prompt, today):
            dropped.append(f"{index}:past-outcome")
            continue
        if any(near_duplicate_prompt(prompt, prev) for prev in kept_prompts):
            dropped.append(f"{index}:near-duplicate")
            continue
        if any(near_duplicate_prompt(prompt, prev) for prev in avoid):
            dropped.append(f"{index}:avoid-near-duplicate")
            continue
        brief_id = cleaned.get("briefId") or None
        brief = by_id.get(str(brief_id)) if brief_id else None
        options = cleaned["options"]
        fmt = cleaned["format"]
        prompt_hi = str(cleaned.get("promptHi") or "").strip() or None
        mapped_options = []
        for opt in options:
            row = {"label": str(opt["label"]).strip(), "isCorrect": bool(opt.get("isCorrect"))}
            label_hi = str(opt.get("labelHi") or "").strip()
            if label_hi:
                row["labelHi"] = label_hi
            mapped_options.append(row)
        cards.append(
            Card(
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
                prompt_hi=prompt_hi,
            )
        )
        kept_prompts.append(prompt)
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
    if any(not label for label in labels):
        return "options"
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
    """Top up with catalog cards when the model returns fewer than `need` prompts. Prefer polls."""
    out = list(cards)
    have = {card.prompt for card in out}
    if len(out) >= need:
        return out
    stock = list(generate_stock(slug))
    polls = [card for card in stock if card.format == "poll"]
    quizzes = [card for card in stock if card.format != "poll"]
    random.shuffle(polls)
    random.shuffle(quizzes)
    for card in polls + quizzes:
        if card.prompt in have:
            continue
        out.append(card)
        have.add(card.prompt)
        if len(out) >= need:
            break
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
    """Ask OpenAI for one category. Raises MissingOpenAIKey when the key is absent."""
    rows = briefs_for(slug, briefs)
    # Ask for a little extra so past-outcome / near-duplicate drops still leave a full batch.
    request = max(need, int(need * 1.35))
    raw = call_openai(
        _messages(slug, request, rows, avoid_prompts=avoid_prompts, insights=insights)
    )
    cards, dropped = validate_candidates(
        raw,
        slug,
        rows,
        freshness_hours=freshness_hours,
        avoid_prompts=avoid_prompts,
    )
    cards, fact_dropped = verify_quiz_facts(cards)
    if fact_dropped:
        dropped.extend(fact_dropped)
        print(f"FACT-GATE {slug}: dropped {len(fact_dropped)} unverified quiz(es)")
    return cards[:need] if len(cards) > need else cards


# Localization brief: Hindi is its own creative layer, not an English calque.
_HI_STYLE = (
    "You are a native Hindi copywriter for Maja (Indian Gen Z / Tier-1–3). "
    "Write a SEPARATE Hindi version in Devanagari — natural spoken bolchal, not machine translation. "
    "Do NOT transliterate the English line. Do NOT keep English words/sentences in Hindi fields. "
    "Rewrite the same idea the way a Hindi-speaking friend would ask it on WhatsApp. "
    "Short, playful, interactive. Prefer everyday Hindi over formal/Sanskrit-heavy Hindi. "
    "Familiar Devanagari loanwords are OK when people actually say them: फ़िल्म, ट्रेलर, मैच, "
    "क्रिकेट, क्विज़, पोल, गेम, स्कोर, रील्स. "
    "BAD: English left in Hindi fields, or literal calques like 'आपका वाइब क्या है?'. "
    "BETTER: 'अगली बड़ी फ़िल्म को लेकर कितने एक्साइटेड हो?' with options 'बहुत ज़्यादा! 🔥' / 'ट्रेलर आने दो पहले'. "
    "Keep meaning, facts, option count/order, and correct answers unchanged. "
    "Do not invent names, numbers, or new facts. "
    "Return Hindi ONLY in promptHi / optionsHi — never change the English prompt or labels. "
    "Never put Devanagari into English fields. Never put English sentences into Hindi fields."
)


def _localize_messages(cards: list[Card]) -> list[dict[str, str]]:
    payload = {
        "style": _HI_STYLE,
        "cards": [
            {
                "id": str(i),
                "prompt": card.prompt,
                "options": [str(opt.get("label") or "") for opt in card.options],
            }
            for i, card in enumerate(cards)
        ],
        "rules": [
            "Return JSON: {\"translations\": [{\"id\", \"promptHi\", \"optionsHi\": [string, ...]}]} .",
            "optionsHi length must match options length and keep the same order.",
            "id must match the input id.",
            "Every promptHi and optionsHi entry must be Devanagari Hindi (loanwords OK).",
            "No bilingual English/Hindi in one field.",
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
                "hi": "रात को भूख लगी तो क्या लोगे?",
                "optionsEn": ["Street stall", "Maggi at home"],
                "optionsHi": ["स्ट्रीट फूड 🔥", "घर की मैगी"],
            },
            {
                "en": "Which one do you prefer?",
                "hi": "तुम्हें इनमें से क्या ज़्यादा पसंद है?",
                "optionsEn": ["Option A", "Option B"],
                "optionsHi": ["ये वाला", "वो वाला"],
            },
        ],
    }
    return [
        {
            "role": "system",
            "content": (
                "You localize Maja poll and quiz cards into natural Indian Hindi for Gen Z. "
                "Write like a friend texting — interactive bolchal, not literal translation. "
                "Reply with a JSON object only."
            ),
        },
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def _apply_hi_row(card: Card, row: dict[str, Any] | None) -> Card:
    if not row:
        return card
    prompt_hi = str(row.get("promptHi") or "").strip() or None
    options_hi = row.get("optionsHi")
    new_options = list(card.options)
    if isinstance(options_hi, list) and len(options_hi) == len(card.options):
        new_options = []
        for opt, hi in zip(card.options, options_hi, strict=True):
            mapped = dict(opt)
            label_hi = str(hi or "").strip()
            if label_hi:
                mapped["labelHi"] = label_hi
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


def localize_hi(cards: list[Card]) -> list[Card]:
    """Fill missing prompt_hi / labelHi via one batched model call. English stays source of truth."""
    pending = [card for card in cards if card.needs_hi()]
    if not pending:
        return [ensure_language_split(card) for card in cards]
    try:
        raw = call_openai(_localize_messages(pending))
    except MissingOpenAIKey:
        return [ensure_language_split(card) for card in cards]
    except Exception:  # noqa: BLE001 — keep English cards if translation fails
        return [ensure_language_split(card) for card in cards]
    by_id: dict[str, dict[str, Any]] = {}
    for row in raw.get("translations") or []:
        if isinstance(row, dict) and row.get("id") is not None:
            by_id[str(row["id"])] = row
    out: list[Card] = []
    pending_i = 0
    for card in cards:
        if not card.needs_hi():
            out.append(ensure_language_split(card))
            continue
        row = by_id.get(str(pending_i))
        pending_i += 1
        out.append(ensure_language_split(_apply_hi_row(card, row)))
    return out


def localize_hi_dicts(moments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Fill promptHi / labelHi on publish payloads (agent + meme batches)."""
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
    filled = localize_hi(stubs)
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
