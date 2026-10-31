"""Export content-gen prompts, rules, and templates into an Excel workbook for Google Sheets."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from scripts.content_gen.agent import (  # noqa: E402
    _HI_STYLE,
    _category_rules,
    _category_scope,
    _messages,
)
from scripts.content_gen.catalog import (  # noqa: E402
    EVENT_POLL_TYPES,
    EVENT_QUIZ_TYPES,
    EVENT_SLUGS,
    ONBOARDING_SLUGS,
    POLLS,
    QUIZZES,
    TREND_POLL_TYPES,
    TREND_QUIZ_TYPES,
    TRENDS_DIR,
    bank_text,
    briefs_for,
    load_briefs,
    load_trends,
    question_types,
    trends_for,
)

OUT = ROOT / "docs" / "content" / "maja-content-gen-prompts.xlsx"
OUT_FALLBACK = ROOT / "docs" / "content" / "maja-content-gen-prompts-latest.xlsx"
MEME_PACK = ROOT / "docs" / "content" / "meme-image-pack.json"

HEADER_FONT = Font(bold=True)
WRAP = Alignment(wrap_text=True, vertical="top")


def _sheet(wb: Workbook, title: str, headers: list[str], rows: list[list[object]], widths: list[int] | None = None):
    ws = wb.create_sheet(title)
    ws.append(headers)
    for cell in ws[1]:
        cell.font = HEADER_FONT
    for row in rows:
        ws.append([("" if v is None else v) for v in row])
    for col_i in range(1, len(headers) + 1):
        letter = get_column_letter(col_i)
        width = widths[col_i - 1] if widths and col_i - 1 < len(widths) else 28
        ws.column_dimensions[letter].width = width
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row, max_col=len(headers)):
        for cell in row:
            cell.alignment = WRAP
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    return ws


def main() -> None:
    wb = Workbook()
    # Drop default sheet; we build named tabs.
    default = wb.active
    wb.remove(default)

    # --- Overview ---
    _sheet(
        wb,
        "Overview",
        ["Section", "Detail"],
        [
            ["Purpose", "Reference for how Maja generates polls/quizzes every ~4 hours"],
            ["Source code", "backend/scripts/content_gen/agent.py + catalog.py"],
            ["Publisher", "scripts/refresh_feed_content.py (GitHub Actions)"],
            ["Model", "OPENAI_MODEL default gpt-4o-mini (OpenRouter if key starts with sk-or-)"],
            [
                "Languages",
                "Two stages, one card: (1) English Content Agent writes prompt/label only; "
                "(2) Hindi Localization Agent writes promptHi/labelHi after English is finalized",
            ],
            ["Batch size", "~20 cards per onboarding category per refresh"],
            ["Card TTL", "~4 hours; previous live moments retired after new batch"],
            ["Active categories", ", ".join(ONBOARDING_SLUGS)],
            ["Event brief categories", ", ".join(sorted(EVENT_SLUGS))],
            ["Trend poll types", ", ".join(sorted(TREND_POLL_TYPES))],
            ["Trend quiz types", ", ".join(sorted(TREND_QUIZ_TYPES))],
            ["Event poll types", ", ".join(sorted(EVENT_POLL_TYPES))],
            ["Event quiz types", ", ".join(sorted(EVENT_QUIZ_TYPES))],
            [
                "How to read this workbook",
                "Agent System Prompt = English-only LLM system message. Agent User Payload = JSON user message schema. "
                "Shared Rules = rules[] sent every category. Category Scope/Rules = sports vs cricket extras. "
                "Evergreen Polls/Quizzes = bank templates. Brief Templates = verified event cards. "
                "Meme Pack = memegen image polls. Hindi Localize = second-pass localization prompt (never invents cards). "
                "Poll Gen & Feed = how polls are created and shown in the swipe feed. "
                "Trends Input = ops-maintained India trends JSON per category.",
            ],
            [
                "India trends",
                "Ops fill backend/scripts/content_gen/trends/{category}.json before refresh. "
                "Merged with briefs into verifiedTrends. Model must not invent trending claims.",
            ],
        ],
        widths=[28, 100],
    )

    # Build messages for a sample category to dump exact prompts.
    sample_slug = "movies"
    msgs = _messages(sample_slug, 20, briefs_for(sample_slug), avoid_prompts=[], insights={})
    system_prompt = msgs[0]["content"]
    user_payload = json.loads(msgs[1]["content"])

    _sheet(
        wb,
        "Agent System Prompt",
        ["Field", "Value"],
        [
            ["role", "system"],
            ["used_for", "English Content Agent (agent_candidates) — English only"],
            ["file", "backend/scripts/content_gen/agent.py → EN_SYSTEM / _messages()"],
            ["content", system_prompt],
        ],
        widths=[18, 120],
    )

    # Shared rules (same for all; category extras listed separately)
    shared_rules = [r for r in user_payload["rules"] if not r.startswith("SCOPE")]
    _sheet(
        wb,
        "Shared Rules",
        ["#", "Rule"],
        [[i + 1, r] for i, r in enumerate(shared_rules)],
        widths=[6, 120],
    )

    # Voice examples
    voice_rows: list[list[object]] = []
    for kind, items in user_payload["voiceExamples"].items():
        if isinstance(items[0], str):
            for text in items:
                voice_rows.append([kind, text, "", ""])
        else:
            for item in items:
                voice_rows.append(
                    [
                        kind,
                        item.get("promptHi", ""),
                        " | ".join(item.get("optionsHi") or []),
                        "",
                    ]
                )
    _sheet(
        wb,
        "Voice Examples",
        ["Bucket", "English prompt example", "Options (if any)", "Notes"],
        voice_rows,
        widths=[16, 70, 50, 20],
    )

    # Payload schema keys
    schema_rows = [
        ["category", "Requested onboarding slug"],
        ["categoryScope", "What the category covers (critical for sports vs cricket)"],
        ["need", "How many candidates to return"],
        ["today", "UTC date ISO — used for freshness / closed-event rules"],
        ["mix", "Target quiz vs poll counts + preferQuizTypes"],
        ["market", "India English feed brief (Hindi is a later localization stage)"],
        ["pollQuestionTypes", "Allowed poll questionType values for this category"],
        ["quizQuestionTypes", "Allowed quiz questionType values for this category"],
        ["trendQuizTypes", "Freeform trivia types not locked to evergreen bank"],
        ["evergreenBank", "Concatenated bank prompts/options the model may copy for bank quizzes"],
        [
            "verifiedTrends",
            "Merged manual India trends JSON + brief-derived trends (never invent trends)",
        ],
        ["briefs", "Verified event briefs for this category (if any)"],
        ["avoidPrompts", "Prompts already live / recent — do not reuse"],
        ["avoidNames", "Proper names extracted from avoidPrompts"],
        ["engagementInsights", "Hit/miss lessons from GET /v1/admin/moments/insights"],
        ["voiceExamples", "Good/bad English-only examples"],
        ["rules", "Full rule list (shared + category SCOPE rules)"],
        [
            "candidate schema",
            "format, category, questionType, type, prompt, options[{label,isCorrect}], briefId "
            "(NO promptHi/labelHi — Hindi localization agent owns those)",
        ],
    ]
    _sheet(wb, "User Payload Schema", ["Key", "Meaning"], schema_rows, widths=[24, 100])

    # Per-category overview
    cat_rows: list[list[object]] = []
    for slug in ONBOARDING_SLUGS:
        scope = _category_scope(slug)
        rules = _category_rules(slug)
        cat_rows.append(
            [
                slug,
                scope.get("label", slug),
                ", ".join(scope.get("include") or []) if isinstance(scope.get("include"), list) else "",
                ", ".join(scope.get("exclude") or []) if isinstance(scope.get("exclude"), list) else "",
                scope.get("note", ""),
                "\n".join(rules),
                ", ".join(sorted(question_types(slug, "poll"))),
                ", ".join(sorted(question_types(slug, "quiz"))),
                len(POLLS.get(slug, ())),
                len(QUIZZES.get(slug, ())),
                "yes" if slug in EVENT_SLUGS else "no",
                len(briefs_for(slug)),
            ]
        )
    _sheet(
        wb,
        "Categories",
        [
            "slug",
            "label",
            "include",
            "exclude",
            "scope_note",
            "category_rules",
            "poll_question_types",
            "quiz_question_types",
            "evergreen_polls",
            "evergreen_quizzes",
            "uses_briefs",
            "brief_count",
        ],
        cat_rows,
        widths=[18, 22, 40, 40, 40, 50, 30, 30, 14, 14, 12, 12],
    )

    # Category scopes / rules detail (one row per rule line)
    scope_rows: list[list[object]] = []
    for slug in ONBOARDING_SLUGS:
        scope = _category_scope(slug)
        scope_rows.append([slug, "label", scope.get("label", slug)])
        for inc in scope.get("include") or []:
            scope_rows.append([slug, "include", inc])
        for exc in scope.get("exclude") or []:
            scope_rows.append([slug, "exclude", exc])
        if scope.get("note"):
            scope_rows.append([slug, "note", scope["note"]])
        for rule in _category_rules(slug):
            scope_rows.append([slug, "rule", rule])
    _sheet(
        wb,
        "Category Scope Rules",
        ["slug", "kind", "text"],
        scope_rows,
        widths=[18, 12, 100],
    )

    # Full sample user payload (movies) for understanding
    _sheet(
        wb,
        "Sample User JSON (movies)",
        ["JSON"],
        [[json.dumps(user_payload, ensure_ascii=False, indent=2)]],
        widths=[140],
    )

    # Evergreen polls
    poll_rows: list[list[object]] = []
    for slug in ONBOARDING_SLUGS:
        for qtype, prompt, options in POLLS.get(slug, ()):
            poll_rows.append([slug, "poll", qtype, prompt, " | ".join(options), len(options), ""])
    _sheet(
        wb,
        "Evergreen Polls",
        ["category", "format", "question_type", "prompt", "options", "option_count", "notes"],
        poll_rows,
        widths=[18, 10, 16, 60, 70, 12, 20],
    )

    # Evergreen quizzes
    quiz_rows: list[list[object]] = []
    for slug in ONBOARDING_SLUGS:
        for qtype, prompt, options, correct in QUIZZES.get(slug, ()):
            correct_label = options[correct] if 0 <= correct < len(options) else ""
            quiz_rows.append(
                [
                    slug,
                    "quiz",
                    qtype,
                    prompt,
                    " | ".join(options),
                    correct,
                    correct_label,
                ]
            )
    _sheet(
        wb,
        "Evergreen Quizzes",
        ["category", "format", "question_type", "prompt", "options", "correct_index", "correct_label"],
        quiz_rows,
        widths=[18, 10, 16, 70, 70, 14, 40],
    )

    # Evergreen bank text blobs (what the model sees)
    bank_rows = [[slug, bank_text(slug)] for slug in ONBOARDING_SLUGS]
    _sheet(
        wb,
        "Evergreen Bank Text",
        ["category", "bank_text_sent_to_model"],
        bank_rows,
        widths=[18, 120],
    )

    # Brief templates
    brief_rows: list[list[object]] = []
    for brief in load_briefs():
        slug = str(brief.get("category") or "")
        for block_name in ("opinion", "debate", "prediction", "challenge", "quiz"):
            block = brief.get(block_name)
            if not isinstance(block, dict):
                continue
            opts = block.get("options") or []
            brief_rows.append(
                [
                    brief.get("id"),
                    slug,
                    brief.get("title"),
                    brief.get("eventDate"),
                    brief.get("context"),
                    brief.get("freshnessHours"),
                    brief.get("allowPrediction"),
                    ", ".join(brief.get("angles") or []),
                    ", ".join(brief.get("facts") or []),
                    block_name,
                    block.get("questionType") or block_name,
                    block.get("prompt"),
                    " | ".join(str(o) for o in opts),
                    block.get("correct") or "",
                ]
            )
    _sheet(
        wb,
        "Brief Templates",
        [
            "brief_id",
            "category",
            "title",
            "eventDate",
            "context",
            "freshnessHours",
            "allowPrediction",
            "angles",
            "facts",
            "block",
            "question_type",
            "prompt",
            "options",
            "correct",
        ],
        brief_rows,
        widths=[24, 12, 28, 12, 30, 14, 14, 30, 50, 12, 14, 50, 50, 20],
    )

    # Manual India trends input (ops JSON per category)
    trend_rows: list[list[object]] = [
        [
            "OPS NOTE",
            "backend/scripts/content_gen/trends/{slug}.json",
            "Fill before refresh; expired expiresAt rows are ignored",
            0,
            0,
            "(schema: trendId, topic, trendScore, freshness, indiaRelevance, eventStatus, facts, allowedAngles, sourceConfidence, expiresAt)",
            "Never invent trending/viral claims without a matching verifiedTrends row or brief",
        ]
    ]
    all_trends = load_trends(TRENDS_DIR)
    for slug in ONBOARDING_SLUGS:
        active = trends_for(slug)
        raw_count = len(all_trends.get(slug) or [])
        path = TRENDS_DIR / f"{slug}.json"
        topics = " | ".join(str(t.get("topic") or "") for t in active[:8])
        angles = " | ".join(
            ",".join(str(a) for a in (t.get("allowedAngles") or [])) for t in active[:5]
        )
        facts = " | ".join(
            "; ".join(str(f) for f in (t.get("facts") or [])[:2]) for t in active[:5]
        )
        trend_rows.append(
            [
                slug,
                str(path.as_posix().replace(str(ROOT.as_posix()) + "/", "")) if path.exists() else "(missing)",
                topics or "(empty — use evergreen trivia + sharp debates, no viral framing)",
                raw_count,
                len(active),
                angles or "",
                facts or "",
            ]
        )
    _sheet(
        wb,
        "Trends Input",
        [
            "category",
            "file",
            "active_topics",
            "raw_count",
            "active_count",
            "allowedAngles",
            "facts_preview",
        ],
        trend_rows,
        widths=[18, 48, 55, 12, 12, 28, 50],
    )

    # Hindi localize
    _sheet(
        wb,
        "Hindi Localize Prompt",
        ["Field", "Value"],
        [
            ["role", "system"],
            ["used_for", "localize_hi / localize_hi_dicts AFTER English cards are finalized"],
            ["file", "hi_localize_prompt.py → HI_LOCALIZE_SYSTEM; agent.py → _localize_messages()"],
            [
                "system_content",
                "Hindi localization expert only — never invents cards or changes game mechanics. "
                "Writes promptHi/labelHi as Gen-Z Devanagari Hinglish for India.",
            ],
            ["style_block", _HI_STYLE],
            [
                "user_payload_shape",
                json.dumps(
                    {
                        "cards": [
                            {
                                "id": "0",
                                "prompt": "...",
                                "options": [{"id": "0", "label": "..."}, {"id": "1", "label": "..."}],
                            }
                        ],
                        "rules": [
                            'Return JSON: {"translations":[{"id","promptHi","options":[{"id","labelHi"}]}]} .',
                            "Legacy optionsHi string arrays also accepted.",
                            "Never change format/category/questionType/type/briefId/isCorrect/option order.",
                            "Every promptHi and labelHi must be Devanagari Hinglish (loanwords OK).",
                        ],
                        "examples": [
                            {
                                "en": "What's your vibe for the next big Bollywood music release?",
                                "hi": "अगली बड़ी बॉलीवुड फ़िल्म को लेकर कितने एक्साइटेड हो?",
                                "optionsEn": ["Excited!", "Cautiously skeptical"],
                                "optionsHi": ["बहुत ज़्यादा! 🔥", "ट्रेलर आने दो पहले 👀"],
                            }
                        ],
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
            ],
        ],
        widths=[22, 120],
    )

    # Meme pack
    meme_rows: list[list[object]] = []
    if MEME_PACK.exists():
        pack = json.loads(MEME_PACK.read_text(encoding="utf-8"))
        for m in pack.get("moments") or []:
            prompt_img = m.get("promptImage") or {}
            opts = m.get("options") or []
            templates = []
            lines_all = []
            for opt in opts:
                img = (opt.get("image") or {}) if isinstance(opt, dict) else {}
                if img.get("template"):
                    templates.append(str(img["template"]))
                if img.get("lines"):
                    lines_all.append(" / ".join(str(x) for x in img["lines"]))
            if prompt_img.get("template"):
                templates.insert(0, f"prompt:{prompt_img['template']}")
                if prompt_img.get("lines"):
                    lines_all.insert(0, "prompt: " + " / ".join(str(x) for x in prompt_img["lines"]))
            meme_rows.append(
                [
                    m.get("categorySlug"),
                    m.get("type"),
                    ", ".join(m.get("tags") or []),
                    m.get("prompt"),
                    " | ".join(str(o.get("label") or "") for o in opts if isinstance(o, dict)),
                    ", ".join(templates),
                    " || ".join(lines_all),
                    pack.get("attribution", ""),
                ]
            )
    _sheet(
        wb,
        "Meme Pack Templates",
        [
            "category",
            "type",
            "tags",
            "prompt",
            "option_labels",
            "memegen_templates",
            "caption_lines",
            "attribution",
        ],
        meme_rows,
        widths=[18, 10, 12, 50, 40, 30, 50, 40],
    )

    # Poll generation + feed display (product/ops explainer)
    poll_feed_rows: list[list[object]] = [
        ["What is a poll?", "A moment card with scoringMode=none, tag poll, and isCorrect=false on every option. No right answer — pick a side / debate."],
        ["Poll vs quiz", "Quiz uses scoringMode=correct_option and exactly one isCorrect=true. Poll never reveals a correct option after answer."],
        ["Card type", "predict = 2 options (A vs B). pulse = 3–4 options."],
        ["Shared poll questionTypes", ", ".join(sorted(TREND_POLL_TYPES)) + " (opinion / debate / hot for freeform India-trend polls)"],
        ["Event poll questionTypes", ", ".join(sorted(EVENT_POLL_TYPES)) + " when category has verified briefs"],
        ["Category bank polls", "Each onboarding category also has evergreen poll templates in catalog.py (see Evergreen Polls sheet)."],
        ["", ""],
        ["GENERATE — step 1", "GitHub Actions / refresh job loads engagement insights (hits, misses, avoidPrompts) from GET /v1/admin/moments/insights."],
        ["GENERATE — step 2", "English Content Agent invents English-only poll prompts + option labels for one category (EN_SYSTEM). Never writes promptHi/labelHi."],
        ["GENERATE — step 3", "Validate: schema, category scope (sports≠cricket), lazy-poll reject, near-duplicates, avoidNames, past-outcome predictions, English purity."],
        ["GENERATE — step 4", "Rank/diversify batch; evergreen bank top-up if still short; attach verified brief event cards when available."],
        ["GENERATE — step 5", "Hindi Localization Agent writes promptHi + labelHi only. Must not change format, options, isCorrect, or briefId."],
        ["GENERATE — step 6", "Publish via POST /v1/admin/moments then transition ready → live. TTL ~4 hours. Previous live moments retired after new batch is up."],
        ["Content sources", "1) Agent freeform trend/opinion polls  2) Evergreen bank polls  3) Verified event briefs  4) Optional meme/image spice"],
        ["Soft mix target", "~55–65% quizzes, ~25–35% polls, ≤~10% predictions when upcoming events exist. Quality beats quotas."],
        ["Strong poll patterns", "A vs B, pick your side, worth the hype?, underrated/overrated, keep or skip, which one wins, best comeback"],
        ["Rejected lazy polls", "Who is your favourite…? / Do you like X? / Which do you prefer? (unless timely + specific)"],
        ["", ""],
        ["FEED — API", "App calls GET /v1/feed?limit=20&lang=en|hi"],
        ["FEED — pool", "Only status=live moments within startsAt/endsAt. Prefer user's interest categories; widen if those are empty."],
        ["FEED — ranking", "Unanswered boosted. Categories shuffled; quiz vs poll alternated so the swipe feed does not feel samey. Mini-games interleaved."],
        ["FEED — language", "One card, two display layers. lang=en → prompt + label. lang=hi → promptHi + labelHi when present. Same card ID, votes, analytics."],
        ["FEED — UI", "MomentFeedPage shows prompt + option buttons. Tap → POST /v1/moments/{id}/responses. Then crowd % split / friends; no correct reveal for polls."],
        ["FEED — client cleanup", "displayCopy() strips leaked Devanagari in English mode (and Latin leftovers in Hindi mode) as a final safety net."],
        ["", ""],
        ["Publish script", "scripts/refresh_feed_content.py (plan_agent_batch → localize_hi → publish_moment)"],
        ["English agent", "backend/scripts/content_gen/agent.py → EN_SYSTEM / _messages / agent_candidates"],
        ["Hindi agent", "backend/scripts/content_gen/hi_localize_prompt.py → HI_LOCALIZE_SYSTEM; localize_hi()"],
        ["Feed ranking", "backend/app/modules/feed/service.py → build_feed / serialize_moment"],
        ["Mobile render", "apps/mobile/src/screens/feed/MomentFeedPage.tsx + lib/displayLang.ts"],
    ]
    # Per-category poll type snapshot for ops.
    for slug in ONBOARDING_SLUGS:
        poll_types = ", ".join(sorted(question_types(slug, "poll")))
        poll_count = len(POLLS.get(slug) or ())
        poll_feed_rows.append(
            [
                f"Category polls — {slug}",
                f"{poll_count} evergreen bank polls; allowed questionTypes: {poll_types}",
            ]
        )
    _sheet(
        wb,
        "Poll Gen & Feed",
        ["Topic", "Detail"],
        poll_feed_rows,
        widths=[28, 110],
    )

    # Candidate output contract
    _sheet(
        wb,
        "Output Contract",
        ["Field", "Rule"],
        [
            ["format", "poll or quiz"],
            ["category", "Must equal requested category slug"],
            ["questionType", "From pollQuestionTypes / quizQuestionTypes for that category"],
            ["type", "predict (2 options) or pulse (3–4 options)"],
            ["prompt", "Natural English only; Latin script; no Hinglish (English agent)"],
            ["promptHi", "Written ONLY by Hindi localization agent after English finalization"],
            ["options[].label", "English only (English agent)"],
            ["options[].labelHi", "Devanagari Hinglish via localization agent only"],
            ["options[].isCorrect", "Exactly one true for quiz; all false for poll"],
            ["briefId", "null unless card uses a verified brief"],
            ["prediction", "Prompt must contain word Prediction + open brief"],
            ["bank quizzes", "Non-trend types must copy evergreen bank prompt/options"],
            [
                "gates",
                "Near-duplicate, lazy poll, past prediction, volatile officeholder quiz, "
                "cricket/sports separation, fact gate, Hinglish-in-English, incomplete Hindi → dropped",
            ],
        ],
        widths=[22, 100],
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    try:
        wb.save(OUT)
        saved = OUT
    except PermissionError:
        wb.save(OUT_FALLBACK)
        saved = OUT_FALLBACK
        print(f"WARN: {OUT.name} is locked (close Excel if open). Wrote fallback instead.")
    print(f"Wrote {saved}")
    print(f"Sheets: {wb.sheetnames}")


if __name__ == "__main__":
    main()
