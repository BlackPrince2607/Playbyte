"""Bundled Hindi-native game packs (no invent agents, no EN→HI translate)."""

from __future__ import annotations

import json
from pathlib import Path

from scripts.import_content import DEFAULT_DIR, HI_DIR, default_pack_paths, load_pack_file

EN_PACKS = (
    "flag",
    "indian_state",
    "food",
    "landmark",
    "emoji_movie",
    "emoji_phrase",
    "emoji_word",
    "emoji_song",
    "word_group",
    "fact",
    "choice_pair",
    "spot_pair",
)


def test_default_import_includes_hi_seeds() -> None:
    paths = default_pack_paths()
    hi_names = {p.name for p in paths if p.parent == HI_DIR}
    en_names = {p.name for p in paths if p.parent == DEFAULT_DIR}
    assert hi_names == {f"{p}.json" for p in EN_PACKS}
    assert en_names == {f"{p}.json" for p in EN_PACKS}


def test_hi_packs_match_en_counts_and_locale() -> None:
    for pack_id in EN_PACKS:
        en_meta, en_items, en_err = load_pack_file(DEFAULT_DIR / f"{pack_id}.json")
        hi_meta, hi_items, hi_err = load_pack_file(HI_DIR / f"{pack_id}.json")
        assert not en_err and not hi_err
        assert en_meta["packId"] == hi_meta["packId"] == pack_id
        assert len(hi_items) == len(en_items)
        assert all(i["locale"] == "hi-IN" for i in hi_items)
        assert all(i["id"].endswith(".hi") for i in hi_items)


def test_flag_hi_answers_are_devanagari() -> None:
    _meta, items, errs = load_pack_file(HI_DIR / "flag.json")
    assert not errs
    au = next(i for i in items if i["id"] == "flag.au.hi")
    assert "ऑस्ट्रेलिया" in (au["answer"] or "")
    assert any("\u0900" <= c <= "\u097F" for h in au["hints"] for c in h)


def test_choice_pair_hi_prompt_is_devanagari() -> None:
    _meta, items, errs = load_pack_file(HI_DIR / "choice_pair.json")
    assert not errs
    chai = next(i for i in items if i["id"] == "choice.chai_coffee.hi")
    prompt = chai["attributes"]["prompt"]
    assert any("\u0900" <= c <= "\u097F" for c in prompt)


def test_word_group_keeps_latin_members_for_word_search() -> None:
    _meta, items, errs = load_pack_file(HI_DIR / "word_group.json")
    assert not errs
    fruits = next(i for i in items if i["id"] == "wg.fruits.hi")
    assert any("\u0900" <= c <= "\u097F" for c in (fruits["answer"] or ""))
    members = fruits["attributes"]["members"]
    assert all(isinstance(m, str) and m.isascii() for m in members)
