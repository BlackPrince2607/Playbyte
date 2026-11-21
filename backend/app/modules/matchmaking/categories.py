"""Online Quick Match category → mini_game key pools.

Players queue on a category; when a match is created the server picks one
enabled game from that pool so questions/variations rotate across duels.
`mixed` has an empty pool and resolves to any enabled mini_game.
"""

from __future__ import annotations

# Keep in sync with apps/mobile/src/screens/battle/categories.ts
CATEGORY_POOLS: dict[str, tuple[str, ...]] = {
    "mixed": (),
    "trivia": (
        "fact_fake",
        "fact_fake_india",
        "fact_fake_science",
        "fact_fake_sports",
        "guess_flag",
        "guess_indian_state",
        "guess_food",
        "guess_landmark",
    ),
    "emoji": (
        "emoji_movie",
        "emoji_bollywood",
        "emoji_phrase",
        "emoji_word",
        "emoji_song",
    ),
    "movies": (
        "emoji_movie",
        "emoji_bollywood",
        "fact_fake_filmy",
    ),
    "music": ("emoji_song",),
    "arcade": (
        "lane_dash",
        "math_rush",
        "math_check",
        "math_blitz",
        "tap_rush",
        "tap_moles",
        "tap_dont_tap",
        "fruit_frenzy",
        "balloon_pop",
    ),
    "puzzle": (
        "find_pair",
        "word_search",
        "word_search_india",
        "spot_shapes",
        "spot_city",
        "maze_runner",
        "connect_dots",
        "arrow_rush",
        "odd_words",
        "odd_emoji",
        "odd_lookalike",
    ),
    "brain": (
        "math_rush",
        "math_check",
        "odd_numbers",
        "connect_dots",
        "arrow_rush",
        "maze_gems",
    ),
}

KNOWN_CATEGORIES = frozenset(CATEGORY_POOLS)


def is_known_category(category: str | None) -> bool:
    return bool(category) and category in KNOWN_CATEGORIES


def pool_for(category: str | None) -> tuple[str, ...]:
    if not category:
        return ()
    return CATEGORY_POOLS.get(category, ())
