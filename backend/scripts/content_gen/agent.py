"""OpenAI agent that proposes poll and quiz cards. A gate drops anything the catalog cannot support."""

from __future__ import annotations

import json
import os
import random
import urllib.request
from datetime import UTC, datetime, timedelta
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
    load_briefs,
    question_types,
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
    payload = {
        "category": slug,
        "need": need,
        "today": today,
        "market": "India (Hindi + Hinglish swipe audience; Gen Z / millennial metros + Tier-2)",
        "pollQuestionTypes": sorted(question_types(slug, "poll")),
        "quizQuestionTypes": sorted(question_types(slug, "quiz")),
        "trendQuizTypes": sorted(TREND_QUIZ_TYPES),
        "evergreenBank": bank_text(slug),
        "briefs": briefs,
        "avoidPrompts": list(avoid_prompts or [])[:120],
        "engagementInsights": insights or {},
        "rules": [
            "Return JSON with a candidates array.",
            "Every candidate category must equal the requested category.",
            f"Today is {today}. Every card must feel current — what India is talking about in this category right now.",
            "Write brand-new prompts. Never reuse or lightly rephrase anything in avoidPrompts.",
            "Prioritize India trends: cricket/IPL, Bollywood/OTT, campus slang, food debates, city weather, reels, politics people actually argue about, tech launches Indians care about.",
            "Learn from engagementInsights: copy the energy of hits (format, length, debate heat); do not clone miss prompts; follow lessons.",
            "Tone: fast, interactive, swipeable — short punchy prompts, spicy but friendly options, no essays.",
            "Aim for roughly half polls and half quizzes when possible.",
            "Polls use questionType opinion, debate, or hot for freeform India-trend options.",
            "Trend quizzes use questionType trivia, who, or which with well-known correct answers (no obscure stats, no invented numbers).",
            "A prediction prompt must contain the word Prediction, set briefId, and the brief must allow it.",
            "Bank quizzes (evergreen types not in trendQuizTypes) must copy prompt and options from the evergreen bank.",
            "Event copy may use only names and numbers that appear in that brief.",
            "A quiz has exactly one correct option. Polls must set isCorrect false on every option.",
            "Two options use type predict. Three or four use type pulse.",
            "Do not use gambling words.",
            "Also return promptHi and each option labelHi in everyday spoken Hindi (Devanagari).",
            "Hindi style: bolchal — keep common English loanwords (क्विज़, पोल, गेम, स्कोर, ट्रेंड). Keep proper names.",
            "Avoid stiff textbook Hindi. Do not invent facts in Hindi that are not in the English copy.",
            f"Return about {need} candidates — fill the feed; quantity with quality.",
        ],
    }
    return [
        {
            "role": "system",
            "content": (
                "You create fresh Maja poll and quiz cards for one category for an Indian swipe feed. "
                "Bias hard toward what is trending in India today. Make cards addictive, interactive, and fast. "
                "Use engagementInsights to improve: more of what got responses/likes, none of the duds. "
                "Never repeat avoidPrompts. "
                "Reply with a JSON object only: {\"candidates\": [...]} . "
                "Each candidate has format, category, questionType, type, prompt, promptHi, options, briefId. "
                "options are {label, labelHi, isCorrect}. briefId is null unless the card uses a verified brief. "
                "promptHi and labelHi are everyday spoken Hindi in Devanagari with common English loanwords."
            ),
        },
        {"role": "user", "content": json.dumps(payload)},
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


def validate_candidates(
    raw: dict[str, Any],
    slug: str,
    briefs: list[dict[str, Any]] | None = None,
    now: datetime | None = None,
    *,
    freshness_hours: int = DEFAULT_FRESHNESS_HOURS,
) -> tuple[list[Card], list[str]]:
    """Keep candidates that match the catalog. Drop the rest with a short reason."""
    now = now or datetime.now(UTC)
    rows = briefs_for(slug, briefs if briefs is not None else load_briefs())
    by_id = {str(row["id"]): row for row in rows}
    allowed_bank = bank_text(slug)
    dropped: list[str] = []
    cards: list[Card] = []
    for index, item in enumerate(raw.get("candidates") or []):
        if not isinstance(item, dict):
            dropped.append(f"{index}:shape")
            continue
        reason = _reject(item, slug, by_id, allowed_bank)
        if reason:
            dropped.append(f"{index}:{reason}")
            continue
        brief_id = item.get("briefId") or None
        brief = by_id.get(str(brief_id)) if brief_id else None
        options = item["options"]
        fmt = item["format"]
        prompt_hi = str(item.get("promptHi") or "").strip() or None
        mapped_options = []
        for opt in options:
            row = {"label": str(opt["label"]).strip(), "isCorrect": bool(opt.get("isCorrect"))}
            label_hi = str(opt.get("labelHi") or "").strip()
            if label_hi:
                row["labelHi"] = label_hi
            mapped_options.append(row)
        cards.append(
            Card(
                type=item["type"],
                category_slug=slug,
                format=fmt,
                question_type=str(item["questionType"]),
                prompt=str(item["prompt"]).strip(),
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
    return cards, dropped


def _reject(item: dict[str, Any], slug: str, by_id: dict[str, dict[str, Any]], allowed_bank: str) -> str | None:
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
        if question_type == "prediction" and not brief.get("allowPrediction"):
            return "prediction-closed"
        if question_type == "prediction" and "prediction" not in prompt.lower():
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
            # Freeform India-trend trivia — gambling check only; model must use well-known facts.
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
    """Top up with catalog cards when the model returns fewer than `need` prompts."""
    out = list(cards)
    have = {card.prompt for card in out}
    if len(out) >= need:
        return out
    stock = list(generate_stock(slug))
    random.shuffle(stock)
    for card in stock:
        if card.prompt in have:
            continue
        out.append(card)
        have.add(card.prompt)
        if len(out) >= need:
            break
    return out


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
    raw = call_openai(
        _messages(slug, need, rows, avoid_prompts=avoid_prompts, insights=insights)
    )
    cards, _dropped = validate_candidates(raw, slug, rows, freshness_hours=freshness_hours)
    return cards


_HI_STYLE = (
    "Everyday spoken Hindi (bolchal) in Devanagari. "
    "Keep common English loanwords people say (क्विज़, पोल, गेम, स्कोर, ट्रेंड). "
    "Keep proper names and numbers. Avoid stiff textbook Hindi. "
    "Do not change meaning or invent facts."
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
        ],
    }
    return [
        {
            "role": "system",
            "content": (
                "You translate Maja poll and quiz cards into everyday spoken Hindi. "
                "Reply with a JSON object only."
            ),
        },
        {"role": "user", "content": json.dumps(payload)},
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


def localize_hi(cards: list[Card]) -> list[Card]:
    """Fill missing prompt_hi / labelHi via one batched model call. English stays source of truth."""
    pending = [card for card in cards if card.needs_hi()]
    if not pending:
        return cards
    try:
        raw = call_openai(_localize_messages(pending))
    except MissingOpenAIKey:
        return cards
    except Exception:  # noqa: BLE001 — keep English cards if translation fails
        return cards
    by_id: dict[str, dict[str, Any]] = {}
    for row in raw.get("translations") or []:
        if isinstance(row, dict) and row.get("id") is not None:
            by_id[str(row["id"])] = row
    out: list[Card] = []
    pending_i = 0
    for card in cards:
        if not card.needs_hi():
            out.append(card)
            continue
        row = by_id.get(str(pending_i))
        pending_i += 1
        out.append(_apply_hi_row(card, row))
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
