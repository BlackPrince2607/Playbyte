"""Helpers for hi-IN content pack localization (no OpenAI calls)."""

from scripts.localize_content_hi import _collect_strings, _hi_id, _set_path


def test_hi_id_suffix() -> None:
    assert _hi_id("fact.taj_mahal") == "fact.taj_mahal.hi"
    assert _hi_id("fact.taj_mahal.hi") == "fact.taj_mahal.hi"


def test_collect_and_set_fact_strings() -> None:
    item = {
        "id": "fact.demo",
        "answer": "Tea",
        "hints": ["Hot drink"],
        "facts": [{"text": "Tea is a drink.", "isTrue": True, "explanation": "From leaves."}],
        "attributes": {"prompt": "Pick one", "distractors": ["Coffee"]},
    }
    paths = {p for p, _ in _collect_strings(item)}
    assert "answer" in paths
    assert "hints.0" in paths
    assert "facts.0.text" in paths
    assert "facts.0.explanation" in paths
    assert "attributes.prompt" in paths
    assert "attributes.distractors.0" in paths

    _set_path(item, "facts.0.text", "चाय एक ड्रिंक है।")
    assert item["facts"][0]["text"] == "चाय एक ड्रिंक है।"
    _set_path(item, "attributes.distractors.0", "कॉफ़ी")
    assert item["attributes"]["distractors"][0] == "कॉफ़ी"
