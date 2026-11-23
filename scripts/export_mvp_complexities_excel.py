"""Export category type matrix + games-in-app workbook (no engine complexity tab)."""

from __future__ import annotations

import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from scripts.content_gen.taxonomy import (  # noqa: E402
    FORMAT_FIND_THE_DIFFERENCE,
    FORMAT_POLL,
    FORMAT_QUIZ,
    FORMAT_THIS_OR_THAT,
    FORMAT_TRIVIA,
    TAXONOMY,
)

OUT = ROOT / "docs" / "content" / "MVP_Complexities_v2.xlsx"

# Human-readable type labels (taxonomy slug → display).
TYPE_LABELS: dict[str, str] = {
    "casting": "Casting debates",
    "nostalgia": "Nostalgia",
    "couples": "Couples / jodis",
    "endings": "Endings",
    "versus": "Versus",
    "prediction": "Predictions",
    "dialogues": "Dialogues",
    "music": "Music / songs",
    "movie_guess": "Guess the movie",
    "song_guess": "Guess the song",
    "dialogue": "Dialogue ID",
    "actors_name": "Actor / actress name",
    "who": "Who…",
    "which": "Which…",
    "actors": "Actors",
    "movies": "Movies",
    "eras": "Eras (90s / 2000s / now)",
    "ott_vs_theatre": "OTT vs theatre",
    "movie_scenes": "Movie scenes",
    "posters": "Posters",
    "sets": "Sets",
    "facts": "Facts",
    "records": "Records",
    "awards": "Awards",
    "ramayana": "Ramayana",
    "mahabharat": "Mahabharat",
    "shiv": "Shiv",
    "krishna": "Krishna",
    "characters": "Characters",
    "morals": "Morals / dharma",
    "hypothetical": "Hypotheticals",
    "events": "Events",
    "weapons": "Weapons / astras",
    "qualities": "Qualities",
    "choices": "Choices",
    "temple_art": "Temple art",
    "scenes": "Scenes",
    "symbols": "Symbols",
    "stories": "Stories",
    "places": "Places",
    "plots": "Plots / twists",
    "cast": "Cast",
    "shows": "Shows",
    "tropes": "Tropes",
    "costumes": "Costumes",
    "captaincy": "Captaincy",
    "ipl": "IPL",
    "rivalries": "Rivalries",
    "death_overs": "Death overs",
    "fan_behaviour": "Fan behaviour",
    "players": "Players",
    "rules": "Rules",
    "formats": "Formats (T20 / ODI / Test)",
    "teams": "Teams",
    "stadiums": "Stadiums",
    "kits": "Kits",
    "moments": "Iconic moments",
    "history": "History",
    "habits": "Habits",
    "regional": "Regional food",
    "spice": "Spice level",
    "street_food": "Street food",
    "cravings": "Cravings",
    "dishes": "Dishes",
    "origins": "Origins",
    "ingredients": "Ingredients",
    "sweet_vs_savoury": "Sweet vs savoury",
    "thalis": "Thalis",
    "street_stalls": "Street stalls",
    "kitchens": "Kitchens",
    "festivals": "Festival food",
    "regions": "Regions",
    "clubs": "Clubs",
    "penalties": "Penalties",
    "fan_culture": "Fan culture",
    "tournaments": "Tournaments",
    "leagues": "Leagues",
    "celebrations": "Celebrations",
    "opinions": "Opinions",
    "india": "India",
    "internet": "Internet culture",
    "social_debate": "Social debates",
    "world": "World",
    "science_lite": "Light science",
    "preferences": "Preferences",
    "landmarks": "Landmarks",
    "maps": "Maps",
    "objects": "Objects",
    "idols": "Idols",
    "comebacks": "Comebacks",
    "ships": "Ships",
    "concepts": "Concepts",
    "songs": "Songs",
    "groups": "Groups",
    "stages": "Stages",
    "outfits": "Outfits",
    "albums": "Albums",
    "discography": "Discography",
    "members": "Members",
    "texting": "Texting habits",
    "dating_playful": "Dating (playful)",
    "friendships": "Friendships",
    "who_is_more_likely": "Who is more likely",
    "number_puzzles": "Number puzzles",
    "patterns": "Patterns",
    "logic_lite": "Logic-lite",
    "quick_calc": "Quick calc",
    "pairs": "Memory pairs",
    "sequences": "Sequences",
    "anagrams": "Anagrams",
    "missing_letters": "Missing letters",
    "synonyms": "Synonyms",
    "riddles": "Word riddles",
    "arithmetic": "Arithmetic",
    "percentages": "Percentages",
    "ratios": "Ratios",
    "quick_facts": "Quick maths facts",
    "recognition": "Recognition",
}

# Extra type divisions so narrow categories feel complete (aligned with shipped games).
EXTRA_TYPES: dict[str, dict[str, tuple[str, ...]]] = {
    "math-puzzles": {
        FORMAT_QUIZ: (
            "number_puzzles",
            "patterns",
            "logic_lite",
            "quick_calc",
            "solve_it",  # Math Rush Solve
            "true_or_trap",  # Math Rush Verify
            "math_blitz",
            "odd_number_pattern",
        ),
    },
    "maths": {
        FORMAT_QUIZ: (
            "arithmetic",
            "percentages",
            "ratios",
            "quick_facts",
            "mental_math",
            "true_or_trap",
            "speed_blitz",
        ),
    },
    "memory-games": {
        FORMAT_FIND_THE_DIFFERENCE: (
            "pairs",
            "sequences",
            "scenes",
            "objects",
            "spot_photo_pairs",
            "emoji_pair_match",
        ),
    },
    "word-puzzles": {
        FORMAT_QUIZ: (
            "anagrams",
            "missing_letters",
            "synonyms",
            "riddles",
            "word_search_classic",
            "word_search_blitz",
            "word_search_mystery",
            "odd_word_out",
            "emoji_word_decode",
        ),
    },
    "boys-girls": {
        FORMAT_POLL: (
            "habits",
            "texting",
            "dating_playful",
            "friendships",
            "who_is_more_likely",
            "social_debate",
            "weekend_plans",
            "group_chat_drama",
        ),
    },
}

EXTRA_LABELS: dict[str, str] = {
    "solve_it": "Solve It (Math Rush)",
    "true_or_trap": "True or Trap",
    "math_blitz": "Math Blitz",
    "odd_number_pattern": "Odd number pattern",
    "mental_math": "Mental maths",
    "speed_blitz": "Speed blitz",
    "spot_photo_pairs": "Spot photo pairs",
    "emoji_pair_match": "Emoji pair match",
    "word_search_classic": "Word Search classic",
    "word_search_blitz": "Word Search blitz",
    "word_search_mystery": "Word Search mystery",
    "odd_word_out": "Odd word out",
    "emoji_word_decode": "Emoji → word",
    "weekend_plans": "Weekend plans",
    "group_chat_drama": "Group chat drama",
}
TYPE_LABELS.update(EXTRA_LABELS)

# Category → games that actually ship in the app for that interest.
CATEGORY_GAMES: dict[str, str] = {
    "bollywood": (
        "Emoji Guess → Movies / Songs; Fact or Fake → Entertainment; "
        "This or That → Desi Debates; Feed polls / trivia / quiz"
    ),
    "mythology": "Feed polls / trivia / this-or-that / quiz; Fact or Fake (mixed)",
    "tv-serials": "Feed polls / trivia / this-or-that / quiz",
    "cricket": (
        "Fact or Fake → Sports; This or That; Feed polls / trivia / quiz "
        "(Guess → Cricketers stub — not live)"
    ),
    "math-puzzles": "Math Rush → Solve It / True or Trap / Math Blitz; Odd One Out → Numbers; Arrow Rush",
    "memory-games": (
        "Find the Pair; Spot the Difference → Objects / City Night / Garden / Space (standalone themes); "
        "Connect the Dots; Maze → Into the Fog"
    ),
    "indian-foods": (
        "Guess → Food; This or That → Food Fight; Fact or Fake; Feed polls / trivia / quiz"
    ),
    "football": "Fact or Fake → Sports; Feed polls / trivia / this-or-that / quiz",
    "general-knowledge": (
        "Guess → Flags / Indian States / Landmarks; Fact or Fake → India / Science / Mixed; "
        "This or That; Feed polls / trivia / quiz"
    ),
    "word-puzzles": (
        "Word Search → Classic / Blitz / Mystery; Odd One Out → Words / Emoji; "
        "Emoji Guess → Words / Phrases"
    ),
    "maths": "Math Rush → Solve It / True or Trap / Math Blitz; Odd One Out → Numbers",
    "kpop": "Feed polls / trivia / this-or-that / quiz; Emoji Guess → Songs (music)",
    "boys-girls": "Feed polls only (habits, texting, who-is-more-likely, social debates)",
}

ORDER = [
    "bollywood",
    "mythology",
    "tv-serials",
    "cricket",
    "math-puzzles",
    "memory-games",
    "indian-foods",
    "football",
    "general-knowledge",
    "word-puzzles",
    "maths",
    "kpop",
    "boys-girls",
]

FMT_COLS = [
    (FORMAT_POLL, "Poll Types"),
    (FORMAT_TRIVIA, "Trivia Types"),
    (FORMAT_THIS_OR_THAT, "This or That Types"),
    (FORMAT_FIND_THE_DIFFERENCE, "Find the Difference Types"),
    (FORMAT_QUIZ, "Quiz Types"),
]

# Shipped games only (available variations).
GAMES_IN_APP = [
    ["Game", "Variations live in app", "Kind", "Tied to categories"],
    ["Guess", "Flags; Indian States; Food; Landmarks", "Quiz", "General Knowledge; Indian Foods"],
    ["Emoji Guess", "Movies; Phrases; Words; Songs", "Quiz / Emoji", "Bollywood; Word Puzzles; K-pop (songs); General"],
    ["Spot the Difference", "Objects; City Night; Garden; Space", "Puzzle", "Standalone theme packs (not Bollywood/Mythology)"],
    ["Odd One Out", "Words; Emoji; Numbers; Lookalikes", "Puzzle", "Word Puzzles; Maths / Math Puzzles"],
    ["Word Search", "Classic; Blitz; Mystery", "Puzzle", "Word Puzzles"],
    ["Tap", "Target Rush; Whack-a-Mole; Reaction", "Arcade", "Arcade (not interest-scoped)"],
    ["Tap / Don't Tap", "Green Light Red Light; Fruit Frenzy; Balloon Pop", "Arcade", "Arcade"],
    ["Connect the Dots", "Connect; Connect Blitz; Connect XL", "Puzzle", "Memory Games / Puzzle"],
    ["Maze", "Maze Runner; Gem Hunt; Into the Fog; Maze Sprint", "Puzzle", "Memory Games / Puzzle"],
    ["Fact or Fake", "Mixed Bag; India; Science; Sports; Entertainment", "Trivia", "General Knowledge; Cricket; Football; Bollywood"],
    ["This or That", "This or That; Food Fight; Desi Debates; Read the Crowd", "Opinion", "Indian Foods; Bollywood; General; Boys & Girls-adjacent"],
    ["Find the Pair", "Pairs (emoji themes)", "Memory", "Memory Games"],
    ["Arrow Rush", "Arrow Puzzle; Arrow Puzzle+", "Puzzle", "Math Puzzles / Brain"],
    ["Math Rush", "Solve It; True or Trap; Math Blitz", "Arcade / Brain", "Maths; Math Puzzles"],
    ["Lane Dash", "Classic", "Arcade", "Arcade"],
]

HEADER_FILL = PatternFill("solid", fgColor="1F4E79")
HEADER_FONT = Font(color="FFFFFF", bold=True)
WRAP = Alignment(wrap_text=True, vertical="top")
THIN = Border(
    left=Side(style="thin", color="D0D0D0"),
    right=Side(style="thin", color="D0D0D0"),
    top=Side(style="thin", color="D0D0D0"),
    bottom=Side(style="thin", color="D0D0D0"),
)
NA = "—"


def label_types(slugs: tuple[str, ...] | list[str]) -> str:
    parts = [TYPE_LABELS.get(s, s.replace("_", " ")) for s in slugs]
    return "; ".join(parts)


def types_for(slug: str, fmt: str) -> str:
    entry = TAXONOMY[slug]
    extras = EXTRA_TYPES.get(slug, {})
    if fmt in extras:
        return label_types(extras[fmt])
    raw = entry["types"].get(fmt, ())
    if not raw:
        return NA
    return label_types(raw)


def style_sheet(ws, rows: int, cols: int, row_height: int = 48) -> None:
    for c in range(1, cols + 1):
        cell = ws.cell(1, c)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = WRAP
        cell.border = THIN
    for r in range(2, rows + 1):
        ws.row_dimensions[r].height = row_height
        for c in range(1, cols + 1):
            cell = ws.cell(r, c)
            cell.alignment = WRAP
            cell.border = THIN


def set_widths(ws, widths: list[int]) -> None:
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


def main() -> None:
    wb = Workbook()

    # --- Category Type Matrix ---
    ws1 = wb.active
    ws1.title = "Category Type Matrix"
    headers = [
        "Category",
        "Formats live",
        "Poll Types",
        "Trivia Types",
        "This or That Types",
        "Find the Difference Types",
        "Quiz Types",
        "Games in the app",
    ]
    for c, h in enumerate(headers, 1):
        ws1.cell(1, c, h)

    fmt_names = {
        FORMAT_POLL: "poll",
        FORMAT_TRIVIA: "trivia",
        FORMAT_THIS_OR_THAT: "this or that",
        FORMAT_FIND_THE_DIFFERENCE: "find the difference",
        FORMAT_QUIZ: "quiz",
    }

    for i, slug in enumerate(ORDER):
        entry = TAXONOMY[slug]
        formats = "; ".join(fmt_names[f] for f in entry["formats"])
        row = [
            entry["label"],
            formats,
            types_for(slug, FORMAT_POLL),
            types_for(slug, FORMAT_TRIVIA),
            types_for(slug, FORMAT_THIS_OR_THAT),
            types_for(slug, FORMAT_FIND_THE_DIFFERENCE),
            types_for(slug, FORMAT_QUIZ),
            CATEGORY_GAMES.get(slug, ""),
        ]
        for c, v in enumerate(row, 1):
            ws1.cell(2 + i, c, v)

    style_sheet(ws1, 1 + len(ORDER), 8, row_height=56)
    set_widths(ws1, [16, 36, 42, 42, 36, 40, 42, 55])
    ws1.freeze_panes = "B2"
    ws1.auto_filter.ref = f"A1:H{1 + len(ORDER)}"

    # --- Games in App ---
    ws2 = wb.create_sheet("Games in App")
    for r, row in enumerate(GAMES_IN_APP, 1):
        for c, v in enumerate(row, 1):
            ws2.cell(r, c, v)
    style_sheet(ws2, len(GAMES_IN_APP), 4, row_height=36)
    set_widths(ws2, [22, 52, 16, 48])
    ws2.freeze_panes = "A2"
    ws2.auto_filter.ref = f"A1:D{len(GAMES_IN_APP)}"

    OUT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT)
    print(OUT.resolve())


if __name__ == "__main__":
    main()
