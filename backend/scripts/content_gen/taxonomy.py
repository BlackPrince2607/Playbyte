"""Hierarchical content taxonomy: category → format → types.

Source of truth for interest categories, allowed formats (subcategories), and
per-format type catalogs. Adding types under an existing format needs no app
release — update this file and the next content refresh picks them up.
"""

from __future__ import annotations

from typing import Any

# Canonical formats (subcategories). New formats may need app UI later.
FORMAT_POLL = "poll"
FORMAT_TRIVIA = "trivia"
FORMAT_THIS_OR_THAT = "this_or_that"
FORMAT_FIND_THE_DIFFERENCE = "find_the_difference"
FORMAT_QUIZ = "quiz"

ALL_FORMATS = (
    FORMAT_POLL,
    FORMAT_TRIVIA,
    FORMAT_THIS_OR_THAT,
    FORMAT_FIND_THE_DIFFERENCE,
    FORMAT_QUIZ,
)

TEXT_FORMATS = frozenset(
    {FORMAT_POLL, FORMAT_TRIVIA, FORMAT_THIS_OR_THAT, FORMAT_QUIZ}
)
OPINION_FORMATS = frozenset({FORMAT_POLL, FORMAT_THIS_OR_THAT})
KNOWLEDGE_FORMATS = frozenset({FORMAT_TRIVIA, FORMAT_QUIZ})

# Topic interests (Bollywood, Mythology, …) — text/opinion formats only.
# Find-the-difference is NOT topic-tied; it lives under memory-games as thematic
# photo packs (objects / city / garden / space), same as the in-app Spot games.
TOPIC_FORMATS = (
    FORMAT_POLL,
    FORMAT_TRIVIA,
    FORMAT_THIS_OR_THAT,
    FORMAT_QUIZ,
)
STANDARD_FORMATS = TOPIC_FORMATS

# Active interest / onboarding categories (user-facing).
ONBOARDING_SLUGS: tuple[str, ...] = (
    "bollywood",
    "mythology",
    "tv-serials",
    "cricket",
    "indian-foods",
    "football",
    "general-knowledge",
    "kpop",
    "boys-girls",
    "math-puzzles",
    "memory-games",
    "word-puzzles",
    "maths",
)

CATEGORY_LABELS: dict[str, str] = {
    "bollywood": "Bollywood",
    "mythology": "Mythology",
    "tv-serials": "TV Serials",
    "cricket": "Cricket",
    "indian-foods": "Indian Foods",
    "football": "Football",
    "general-knowledge": "General Knowledge",
    "kpop": "K-pop",
    "boys-girls": "Boys & Girls",
    "math-puzzles": "Math Puzzles",
    "memory-games": "Memory Games",
    "word-puzzles": "Word Puzzles",
    "maths": "Maths",
}

# Legacy slug → new slug (interest remap + content_gen alias).
LEGACY_SLUG_MAP: dict[str, str] = {
    "movies": "bollywood",
    "food": "indian-foods",
    "sports": "football",
    "personality-vibe": "boys-girls",
    "math-numbers": "maths",
    "puzzles": "math-puzzles",
    "logical-reasoning": "math-puzzles",
    "music": "bollywood",
    "pop-culture": "general-knowledge",
    "gaming": "general-knowledge",
    "news": "general-knowledge",
    "tech": "general-knowledge",
    "fashion": "bollywood",
    "health": "general-knowledge",
}

# Categories that still accept verified event briefs / trends.
EVENT_SLUGS = frozenset({"cricket", "football", "bollywood", "kpop", "tv-serials"})

# Skill / puzzle interests: scored quizzes only — never opinion polls, never "trivia" framing.
QUIZ_ONLY_SLUGS = frozenset({"word-puzzles", "math-puzzles", "maths"})


def _entry(
    *,
    label: str,
    formats: tuple[str, ...],
    types: dict[str, tuple[str, ...]],
    include: tuple[str, ...] = (),
    exclude: tuple[str, ...] = (),
    scope_note: str = "",
) -> dict[str, Any]:
    return {
        "label": label,
        "formats": list(formats),
        "types": {k: list(v) for k, v in types.items()},
        "include": list(include),
        "exclude": list(exclude),
        "scope_note": scope_note,
    }


# High-engagement pollTypes (New prompt sheet) + legacy freeform labels.
_STD_POLL = (
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
    "opinion",
    "debate",
    "hot",
)
_STD_THIS = ("versus", "habits", "preferences", "nostalgia")
# Standalone Spot the Difference themes (not Bollywood / mythology / etc.).
_FTD_THEMES = ("objects", "city", "garden", "space")
_STD_QUIZ = ("rules", "facts", "who", "which", "records")
_STD_TRIVIA = ("who", "which", "facts", "recognition")

TAXONOMY: dict[str, dict[str, Any]] = {
    "bollywood": _entry(
        label="Bollywood",
        formats=TOPIC_FORMATS,
        types={
            FORMAT_POLL: (
                *_STD_POLL,
                "casting",
                "nostalgia",
                "couples",
                "endings",
                "dialogues",
                "music",
            ),
            FORMAT_TRIVIA: (
                "movie_guess",
                "song_guess",
                "dialogue",
                "actors_name",
                "who",
                "which",
            ),
            FORMAT_THIS_OR_THAT: ("actors", "movies", "eras", "ott_vs_theatre"),
            FORMAT_QUIZ: ("facts", "records", "awards", "who", "which"),
        },
        include=(
            "Hindi cinema",
            "actors and actresses",
            "iconic scenes and dialogues",
            "OTT vs theatre",
            "nostalgia 90s/2000s",
            "music and dance",
        ),
        exclude=("Hollywood as the main topic", "politics"),
    ),
    "mythology": _entry(
        label="Mythology",
        formats=TOPIC_FORMATS,
        types={
            FORMAT_POLL: (
                *_STD_POLL,
                "ramayana",
                "mahabharat",
                "shiv",
                "krishna",
                "characters",
                "morals",
            ),
            FORMAT_TRIVIA: ("characters", "events", "weapons", "who", "which"),
            FORMAT_THIS_OR_THAT: ("characters", "qualities", "choices"),
            FORMAT_QUIZ: ("stories", "characters", "places", "who", "which"),
        },
        include=(
            "Ramayana",
            "Mahabharata",
            "Shiv / Krishna and related stories",
            "moral dilemmas",
            "character debates",
        ),
        exclude=(
            "insulting religious beliefs",
            "presenting disputed interpretations as universal fact",
        ),
        scope_note="Be respectful of beliefs and regional versions.",
    ),
    "tv-serials": _entry(
        label="TV Serials",
        formats=TOPIC_FORMATS,
        types={
            FORMAT_POLL: (
                *_STD_POLL,
                "plots",
                "characters",
                "endings",
                "nostalgia",
            ),
            FORMAT_TRIVIA: ("dialogue", "cast", "shows", "who", "which"),
            FORMAT_THIS_OR_THAT: ("shows", "characters", "tropes"),
            FORMAT_QUIZ: ("facts", "cast", "who", "which"),
        },
        include=(
            "Indian TV serials",
            "daily soaps",
            "iconic characters",
            "plot twists",
            "nostalgia",
        ),
        exclude=("politics as the main topic",),
    ),
    "cricket": _entry(
        label="Cricket",
        formats=TOPIC_FORMATS,
        types={
            FORMAT_POLL: (
                *_STD_POLL,
                "captaincy",
                "ipl",
                "rivalries",
                "death_overs",
                "fan_behaviour",
            ),
            FORMAT_TRIVIA: ("players", "records", "rules", "who", "which"),
            FORMAT_THIS_OR_THAT: ("players", "formats", "teams"),
            FORMAT_QUIZ: ("rules", "records", "history", "who", "which"),
        },
        include=(
            "IPL",
            "international cricket",
            "T20 / ODI / Tests",
            "players",
            "captaincy",
            "rivalries",
        ),
        exclude=("football and other non-cricket sports as the main topic",),
    ),
    "indian-foods": _entry(
        label="Indian Foods",
        formats=TOPIC_FORMATS,
        types={
            FORMAT_POLL: (
                *_STD_POLL,
                "habits",
                "regional",
                "spice",
                "street_food",
                "cravings",
            ),
            FORMAT_TRIVIA: ("dishes", "origins", "ingredients", "who", "which"),
            FORMAT_THIS_OR_THAT: ("dishes", "regions", "sweet_vs_savoury"),
            FORMAT_QUIZ: ("origins", "ingredients", "festivals", "who", "which"),
        },
        include=(
            "Indian regional cuisine",
            "street food",
            "home cooking",
            "spice and habits",
            "festival food",
        ),
        exclude=("non-food lifestyle as the main topic",),
    ),
    "football": _entry(
        label="Football",
        formats=TOPIC_FORMATS,
        types={
            FORMAT_POLL: (
                *_STD_POLL,
                "clubs",
                "rivalries",
                "penalties",
                "fan_culture",
            ),
            FORMAT_TRIVIA: ("players", "tournaments", "clubs", "who", "which"),
            FORMAT_THIS_OR_THAT: ("players", "clubs", "leagues"),
            FORMAT_QUIZ: ("rules", "history", "records", "who", "which"),
        },
        include=(
            "Indian and international football",
            "Premier League",
            "Champions League",
            "World Cup",
            "club rivalries",
            "player comparisons",
        ),
        exclude=("cricket as the main topic",),
    ),
    "general-knowledge": _entry(
        label="General Knowledge",
        formats=TOPIC_FORMATS,
        types={
            FORMAT_POLL: (
                *_STD_POLL,
                "opinions",
                "habits",
                "india",
                "internet",
            ),
            FORMAT_TRIVIA: ("india", "world", "science_lite", "who", "which"),
            FORMAT_THIS_OR_THAT: ("habits", "places", "preferences"),
            FORMAT_QUIZ: ("india", "world", "science_lite", "who", "which"),
        },
        include=(
            "India facts",
            "everyday knowledge",
            "light science",
            "geography",
            "internet culture",
        ),
        exclude=("party politics", "exam-cram capital/date dumps"),
    ),
    "kpop": _entry(
        label="K-pop",
        formats=TOPIC_FORMATS,
        types={
            FORMAT_POLL: (
                *_STD_POLL,
                "idols",
                "comebacks",
                "ships",
                "concepts",
            ),
            FORMAT_TRIVIA: ("songs", "groups", "facts", "who", "which"),
            FORMAT_THIS_OR_THAT: ("groups", "concepts", "eras"),
            FORMAT_QUIZ: ("discography", "members", "who", "which"),
        },
        include=(
            "K-pop idols and groups",
            "comebacks",
            "concepts",
            "fandom habits",
            "light K-drama crossover",
        ),
        exclude=("non-K entertainment as the main topic",),
    ),
    "boys-girls": _entry(
        label="Boys & Girls",
        formats=(FORMAT_POLL,),
        types={
            FORMAT_POLL: (
                *_STD_POLL,
                "habits",
                "texting",
                "dating_playful",
                "friendships",
            ),
        },
        include=(
            "playful everyday behavioural differences",
            "texting",
            "friendships",
            "dating expectations",
            "who is more likely",
        ),
        exclude=(
            "insulting either gender",
            "presenting stereotypes as facts",
            "explicit or harmful content",
        ),
        scope_note="Playful and balanced only — never insulting.",
    ),
    "math-puzzles": _entry(
        label="Math Puzzles",
        formats=(FORMAT_QUIZ,),
        types={
            FORMAT_QUIZ: ("number_puzzles", "patterns", "logic_lite", "quick_calc"),
        },
        include=("number puzzles", "patterns", "quick mental math", "logic-lite"),
        exclude=(
            "formal exam papers",
            "advanced university math",
            "opinion polls",
            "preference questions",
            "meta definitions of puzzle types",
        ),
        scope_note="QUIZ ONLY — every card needs one objectively correct answer.",
    ),
    "memory-games": _entry(
        label="Memory Games",
        formats=(FORMAT_FIND_THE_DIFFERENCE,),
        types={
            # Theme packs — not Bollywood/Mythology/etc. Matches in-app Spot variations.
            FORMAT_FIND_THE_DIFFERENCE: _FTD_THEMES,
        },
        include=(
            "spot the difference",
            "thematic photo packs (objects, city night, garden, space/galaxy)",
            "visual recall",
        ),
        exclude=(
            "topic-tied scenes (Bollywood posters, mythology art, sports kits)",
            "text-only trivia as the main format",
        ),
        scope_note="Standalone visual game — themes are picture packs, not interest categories.",
    ),
    "word-puzzles": _entry(
        label="Word Puzzles",
        formats=(FORMAT_QUIZ,),
        types={
            FORMAT_QUIZ: ("anagrams", "missing_letters", "synonyms", "riddles"),
        },
        include=("anagrams", "word riddles", "missing letters", "synonyms"),
        exclude=(
            "long essay answers",
            "opinion polls",
            "preference questions",
            "meta definitions of puzzle types",
        ),
        scope_note="QUIZ ONLY — solvable word puzzles with one correct answer, not trivia polls.",
    ),
    "maths": _entry(
        label="Maths",
        formats=(FORMAT_QUIZ,),
        types={
            FORMAT_QUIZ: ("arithmetic", "percentages", "ratios", "quick_facts"),
        },
        include=("arithmetic", "percentages", "ratios", "everyday maths"),
        exclude=(
            "advanced calculus",
            "exam-cram proofs",
            "opinion polls",
            "preference questions",
        ),
        scope_note="QUIZ ONLY — every card needs one objectively correct answer.",
    ),
}


def normalize_slug(slug: str) -> str:
    """Map legacy slugs onto the active taxonomy when possible."""
    s = (slug or "").strip().lower()
    if s in TAXONOMY:
        return s
    return LEGACY_SLUG_MAP.get(s, s)


def category_entry(slug: str) -> dict[str, Any] | None:
    return TAXONOMY.get(normalize_slug(slug))


def formats_for(slug: str) -> list[str]:
    entry = category_entry(slug)
    return list(entry["formats"]) if entry else []


def types_for(slug: str, fmt: str) -> list[str]:
    entry = category_entry(slug)
    if not entry:
        return []
    return list(entry["types"].get(fmt, []))


def all_types_for(slug: str) -> dict[str, list[str]]:
    entry = category_entry(slug)
    if not entry:
        return {}
    return {k: list(v) for k, v in entry["types"].items()}


def category_scope(slug: str) -> dict[str, Any]:
    entry = category_entry(slug)
    if not entry:
        return {"slug": slug, "label": slug, "include": [], "exclude": [], "note": ""}
    return {
        "slug": normalize_slug(slug),
        "label": entry["label"],
        "include": list(entry["include"]),
        "exclude": list(entry["exclude"]),
        "note": entry.get("scope_note") or "",
        "formats": list(entry["formats"]),
        "types": all_types_for(slug),
    }


def format_to_scoring_mode(fmt: str) -> str:
    if fmt in KNOWLEDGE_FORMATS:
        return "correct_option"
    return "none"


def format_to_tags(fmt: str, slug: str | None = None) -> list[str]:
    if fmt == FORMAT_FIND_THE_DIFFERENCE:
        return ["game"]
    if fmt in KNOWLEDGE_FORMATS:
        # Puzzle / maths skill cards are quizzes with a right answer — not topic trivia.
        if slug and normalize_slug(slug) in QUIZ_ONLY_SLUGS:
            return ["quiz"]
        return ["trivia"]
    return ["poll"]


def is_opinion_format(fmt: str) -> bool:
    return fmt in OPINION_FORMATS


def is_quiz_only_category(slug: str) -> bool:
    return normalize_slug(slug) in QUIZ_ONLY_SLUGS


def is_text_format(fmt: str) -> bool:
    return fmt in TEXT_FORMATS


def taxonomy_payload(slug: str) -> dict[str, Any]:
    """Compact payload fragment for the LLM user message."""
    scope = category_scope(slug)
    return {
        "category": scope["slug"],
        "categoryLabel": scope["label"],
        "allowedFormats": scope["formats"],
        "typesByFormat": scope["types"],
        "categoryScope": {
            "include": scope["include"],
            "exclude": scope["exclude"],
            "note": scope["note"],
        },
    }
