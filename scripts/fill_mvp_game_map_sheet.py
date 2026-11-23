"""Fill MVP Game Map category matrix + complexity columns from live taxonomy/engines."""

from __future__ import annotations

import csv
import sys
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from scripts.content_gen.taxonomy import (  # noqa: E402
    CATEGORY_LABELS,
    FORMAT_FIND_THE_DIFFERENCE,
    FORMAT_POLL,
    FORMAT_QUIZ,
    FORMAT_THIS_OR_THAT,
    FORMAT_TRIVIA,
    TAXONOMY,
)

SRC = ROOT / "tmp_complexities_sheet2.xlsx"
OUT_XLSX = ROOT / "docs" / "content" / "MVP_Game_Map_filled.xlsx"
OUT_CSV = ROOT / "docs" / "content" / "MVP_category_matrix_filled.csv"

FMT_LABEL = {
    FORMAT_POLL: "poll",
    FORMAT_TRIVIA: "trivia",
    FORMAT_THIS_OR_THAT: "this or that",
    FORMAT_FIND_THE_DIFFERENCE: "find the difference",
    FORMAT_QUIZ: "quiz",
}

# Sheet row order (matches existing MVP Game Map category matrix).
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

HEADERS = [
    "categories",
    "subcategories (formats)",
    "Poll Types",
    "Trivia Types",
    "This or That",
    "Find the Difference",
    "Quiz Types",
]


def join_types(types: dict, fmt: str) -> str:
    vals = types.get(fmt, [])
    return ", ".join(vals) if vals else ""


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing export: {SRC}")

    wb = load_workbook(SRC)
    ws = wb["MVP Game Map"]

    # --- Complexity + shipped variations for engine table ---
    ws.cell(1, 7, "Complexity (easy → hard dimensions)")
    ws.cell(1, 8, "Shipped variations (code)")
    ws.cell(1, 9, "Notes vs sheet")

    complexities = {
        2: (
            "optionCount 3→5; similarity 0.15→0.85; targetDifficulty 0.15→0.85; time 15s→7s; clues 3→1",
            "flag, indian_state, food, landmark (movie/dialogue/cricket/logo/brand stub)",
            "Playable geo/food/landmark; others unavailable",
        ),
        3: (
            "optionCount 3→5; similarity 0.15→0.85; targetDifficulty 0.15→0.85; time 20s→9s; clues 2→1",
            "movie, phrase, word, song (celebrity/brand stub)",
            "Song pack shipped; festival not a separate variation",
        ),
        4: (
            "diffCount 3→6; scene detail 14→34; subtlety 0→1; minSize 0.03→0.012; time 75s→45s",
            "shapes, city, garden, space (spot_pair photos)",
            "Photo pairs; not Find 1/2/3 as separate engines",
        ),
        5: (
            "optionCount 4→6; similarity 0.1→0.9; targetDifficulty 0.15→0.85; time 15s→6s",
            "words, emoji, numbers, lookalike",
            "Lookalike + numbers procedural",
        ),
        6: (
            "grid 6→10; words 4→8; directions 2→8; time 150s→80s; themeDifficulty 0.1→0.6",
            "classic, blitz, mystery",
            "Theme packs via word_group",
        ),
        7: (
            "targetSize 0.12→0.065; spawn 850→380ms; ttl 1900→850ms; maxAlive 2→5; drift 0→0.22; reaction 1000→550ms; falseCue 0→0.5",
            "rush, moles, reaction",
            "Arcade procedural",
        ),
        8: (
            "TAP dims + decoyRatio 0.3→0.45; ttl 2100→1000; spawn 800→420; drift 0→0.12",
            "flip, fruit, balloons",
            "Rule-flip emoji arcade",
        ),
        9: (
            "board 5→9; pairDensity 1→0.75; timePerCell 3000→1500ms",
            "classic, blitz, big",
            "Procedural",
        ),
        10: (
            "size 6→13; braid 0.6→0.05; timePerCell 1100→520ms; gems 3→5",
            "classic, gems, fog, sprint",
            "Fog = into the fog",
        ),
        11: ("— (not implemented)", "—", "Pending stub only (color_sort id)"),
        12: (
            "optionCount 2; targetDifficulty 0.15→0.85; time 12s→6s",
            "mixed, india, science, sports, entertainment",
            "Done",
        ),
        13: (
            "time 10s→5s; crowd-split difficulty 0.15→0.85",
            "this_or_that, food_fight, desi, crowd",
            "Display name: This or That",
        ),
        14: (
            "timeLimit 50s→30s",
            "pairs (Find the Pair)",
            "Shipped as Find the Pair — sheet variants are legacy names",
        ),
        15: ("— (not implemented)", "—", "Pending stub only (sequence id)"),
    }
    for row, (comp, vars_, notes) in complexities.items():
        ws.cell(row, 7, comp)
        ws.cell(row, 8, vars_)
        ws.cell(row, 9, notes)

    # Align Memory row with shipped Find the Pair
    ws.cell(14, 2, "🧠 Memory / Find the Pair")
    ws.cell(14, 3, "Find the Pair (emoji themes)")
    ws.cell(14, 6, "Done")

    # Append missing shipped engines (rows 16–18)
    extras = [
        (
            15.0,
            "⚡ Arrow Rush",
            "s20 (10s/board); s25 (12s/board)",
            "Arcade; Puzzle",
            "P0",
            "Done",
            "board width 5→6; fill 0.62→0.78",
            "s20, s25",
            "Shipped; previously only listed under Puzzle",
        ),
        (
            16.0,
            "🔢 Math Rush",
            "Solve; Verify; Blitz",
            "Math; Arcade",
            "P0",
            "Done",
            "optionCount 4; similarity 0.4→0.9; targetDifficulty 0.1→0.95; time 8s→3.5s",
            "solve, verify, blitz",
            "Shipped; maps to Maths / Math Puzzles",
        ),
        (
            17.0,
            "🏎️ Lane Dash",
            "Classic 3-lane dodge",
            "Arcade",
            "P1",
            "Done",
            "density 0.25→0.85; speed 0.7→1.25; run 42s→36s",
            "classic",
            "Shipped arcade",
        ),
    ]
    for i, rowdata in enumerate(extras):
        r = 16 + i
        for c, v in enumerate(rowdata, 1):
            ws.cell(r, c, v)

    # --- Top Categories (rows 21–28) ---
    ws.cell(21, 1, "Top Categories")
    ws.cell(21, 2, "Sub Categories / Notes")
    ws.cell(21, 3, "In-app engines / packs")
    ws.cell(21, 4, "Product notes")

    top = [
        (
            "Poll",
            "bollywood, mythology, tv-serials, cricket, indian-foods, football, general-knowledge, kpop, boys-girls",
            "Feed poll cards (content_gen)",
            "What's the Buzz? = Daily 10 Polls",
        ),
        (
            "Trivia / Fact or Fake",
            "bollywood, mythology, cricket, indian-foods, football, general-knowledge, kpop + fact_fake packs",
            "fact_fake (mixed/india/science/sports/entertainment)",
            "Knowledge true/false",
        ),
        (
            "Quiz / Guess",
            "flags, indian states, food, landmarks; emoji movie/phrase/word/song",
            "guess, emoji_guess",
            "Emoji decode + image guess",
        ),
        (
            "This or That",
            "food fight, desi debates, crowd / prefer / predict",
            "choice (this_or_that, food_fight, desi, crowd)",
            "Opinion split cards",
        ),
        (
            "Memory",
            "Find the Pair (emoji themes)",
            "memory / pairs",
            "Shipped as Find the Pair — not classic what's-missing variants",
        ),
        (
            "Puzzle",
            "Spot the Difference, Odd One Out, Word Search, Maze, Connect Dots, Arrow Rush, Math Rush",
            "spot_difference, odd_one_out, word_search, maze, connect_dots, arrow_puzzle, math_rush",
            "Includes fog maze + Arrow Rush",
        ),
        (
            "Arcade Games",
            "Tap, Tap/Don't Tap, Lane Dash",
            "tap, tap_dont_tap, lane_dash",
            "Reflex / dodge",
        ),
    ]
    for i, row in enumerate(top):
        for c, v in enumerate(row, 1):
            ws.cell(22 + i, c, v)

    # --- Category × format × type matrix (row 33+) from taxonomy.py ---
    for i, h in enumerate(HEADERS, 1):
        ws.cell(33, i, h)

    for r in range(34, 51):
        for c in range(1, 8):
            ws.cell(r, c, None)

    rows_out: list[list[str]] = []
    for i, slug in enumerate(ORDER):
        entry = TAXONOMY[slug]
        formats = ", ".join(FMT_LABEL[f] for f in entry["formats"])
        types = entry["types"]
        row = [
            entry["label"],
            formats,
            join_types(types, FORMAT_POLL),
            join_types(types, FORMAT_TRIVIA),
            join_types(types, FORMAT_THIS_OR_THAT),
            join_types(types, FORMAT_FIND_THE_DIFFERENCE),
            join_types(types, FORMAT_QUIZ),
        ]
        for c, v in enumerate(row, 1):
            ws.cell(34 + i, c, v)
        rows_out.append(row)

    OUT_XLSX.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT_XLSX)

    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(HEADERS)
        w.writerows(rows_out)

    print(f"Wrote {OUT_XLSX}")
    print(f"Wrote {OUT_CSV}")
    print(f"Categories filled: {len(ORDER)}")
    _ = CATEGORY_LABELS  # keep import used for clarity


if __name__ == "__main__":
    main()
