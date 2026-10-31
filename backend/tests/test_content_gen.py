"""Catalog, brief, and agent-gate tests. They do not call OpenAI."""

from datetime import UTC, datetime

import pytest

from scripts.content_gen.agent import (
    EN_SYSTEM,
    MissingOpenAIKey,
    _apply_hi_row,
    _messages,
    discard_localization_fields,
    ensure_language_split,
    fill_evergreen,
    lazy_poll_issue,
    localization_preserves_mechanics,
    localize_hi,
    merge_verified_trends,
    near_duplicate_prompt,
    normalize_verified_trends,
    off_category_topic_issue,
    past_outcome_issue,
    require_key,
    resolve_chat_endpoint,
    unverified_trend_claim_issue,
    validate_candidates,
    verify_quiz_facts,
    volatile_fact_issue,
)
from scripts.content_gen.hi_localize_prompt import HI_LOCALIZE_SYSTEM
from scripts.content_gen.catalog import (
    MIN_LIVE,
    ONBOARDING_SLUGS,
    POLLS,
    QUIZZES,
    Card,
    bank_labels,
    cards_from_brief,
    event_cards,
    fact_issues,
    generate_stock,
    load_briefs,
    normalize_manual_trends,
    prefer_devanagari,
    strip_devanagari,
    trends_for,
)


def test_every_category_has_polls_and_quizzes() -> None:
    for slug in ONBOARDING_SLUGS:
        cards = generate_stock(slug)
        assert len(cards) >= MIN_LIVE, slug
        assert any(card.format == "poll" for card in cards), slug
        assert any(card.format == "quiz" for card in cards), slug
        assert all(card.ends_at is None for card in cards), slug
        assert all(card.category_slug == slug for card in cards)
        for card in cards:
            blob = (card.prompt + " " + " ".join(card.option_labels())).lower()
            for word in ("odds", "payout", "bet", "stake", "wager"):
                assert word not in blob, (slug, card.prompt, word)
        for card in cards:
            blob = (card.prompt + " " + " ".join(card.option_labels())).lower()
            for word in ("odds", "payout", "bet", "stake", "wager"):
                assert word not in blob, (slug, card.prompt, word)


def test_personality_options_come_from_the_bank() -> None:
    labels = bank_labels("personality-vibe")
    types = {row[0] for row in POLLS["personality-vibe"]}
    assert {"travel", "fitness", "social", "everyday", "work", "friendship"} <= types
    assert {row[0] for row in QUIZZES["personality-vibe"]} <= types
    polls = [card for card in generate_stock("personality-vibe") if card.format == "poll"]
    assert polls
    for card in polls:
        assert card.type in {"predict", "pulse"}
        for option in card.options:
            assert option["label"] in labels
            assert option["isCorrect"] is False


def test_personality_quizzes_have_one_correct_profile() -> None:
    quizzes = [card for card in generate_stock("personality-vibe") if card.format == "quiz"]
    assert len(quizzes) >= 6
    for card in quizzes:
        assert sum(1 for option in card.options if option["isCorrect"]) == 1
        assert card.scoring_mode == "correct_option"


def test_event_brief_emits_supported_formats_only() -> None:
    brief = next(row for row in load_briefs() if row["id"] == "ind-nz-t20-2026-10-22")
    now = datetime(2026, 10, 24, tzinfo=UTC)
    cards = cards_from_brief(brief, now=now)
    kinds = {card.question_type for card in cards}
    assert {"opinion", "debate", "prediction", "challenge", "stat"} <= kinds
    quiz = next(card for card in cards if card.format == "quiz")
    assert sum(1 for option in quiz.options if option["isCorrect"]) == 1
    assert all(card.ends_at is not None for card in cards)
    assert all("India vs New Zealand" in card.prompt for card in cards)
    prediction = next(card for card in cards if card.question_type == "prediction")
    assert "prediction" in prediction.prompt.lower()

    closed = dict(brief)
    closed["allowPrediction"] = False
    closed_kinds = {card.question_type for card in cards_from_brief(closed, now=now)}
    assert "prediction" not in closed_kinds


def test_unknown_name_or_number_is_rejected() -> None:
    brief = next(row for row in load_briefs() if row["category"] == "cricket")
    allowed = __import__("json").dumps(brief)
    assert fact_issues("How many runs did Virat Kohli score?", ["82", "67"], allowed)


def test_movies_brief_uses_a_longer_window() -> None:
    now = datetime(2026, 10, 24, tzinfo=UTC)
    cards = event_cards("movies", now=now)
    assert cards
    assert all(card.category_slug == "movies" for card in cards)
    assert all(card.ends_at is not None and card.ends_at > now for card in cards)


def test_agent_drops_other_category_and_unknown_facts() -> None:
    qtype, prompt, options = POLLS["kpop"][0]
    briefs = load_briefs()
    now = datetime(2026, 10, 29, tzinfo=UTC)
    raw = {
        "candidates": [
            {
                "format": "poll",
                "category": "sports",
                "questionType": "watch",
                "type": "predict",
                "prompt": "Big match night. Where are you?",
                "options": [
                    {"label": "On the couch with the stream", "isCorrect": False},
                    {"label": "In the stands if you can get a ticket", "isCorrect": False},
                ],
            },
            {
                "format": "poll",
                "category": "kpop",
                "questionType": qtype,
                "type": "predict",
                "prompt": prompt,
                "options": [
                    {"label": options[0], "isCorrect": False},
                    {"label": options[1], "isCorrect": False},
                ],
            },
            {
                "format": "quiz",
                "category": "cricket",
                "questionType": "stat",
                "type": "pulse",
                "briefId": "ind-nz-t20-2026-10-22",
                "prompt": "How many runs did Virat Kohli score?",
                "options": [
                    {"label": "82", "isCorrect": True},
                    {"label": "67", "isCorrect": False},
                    {"label": "33", "isCorrect": False},
                ],
            },
        ]
    }
    cards, dropped = validate_candidates(raw, "kpop", briefs, now=now)
    assert [card.category_slug for card in cards] == ["kpop"]
    assert cards[0].ends_at is not None and cards[0].ends_at > now
    assert any(item.endswith(":category") for item in dropped)

    cricket, cricket_dropped = validate_candidates(raw, "cricket", briefs, now=now)
    assert cricket == []
    assert cricket_dropped


def test_trend_poll_allows_freeform_options() -> None:
    now = datetime(2026, 10, 29, tzinfo=UTC)
    raw = {
        "candidates": [
            {
                "format": "poll",
                "category": "kpop",
                "questionType": "hot",
                "type": "predict",
                "prompt": "New title track dropped overnight. Instant replay or one careful listen?",
                "options": [
                    {"label": "Loop it immediately", "isCorrect": False},
                    {"label": "One careful first listen", "isCorrect": False},
                ],
            },
            {
                "format": "poll",
                "category": "kpop",
                "questionType": "hot",
                "type": "predict",
                "prompt": "Would you stake the comeback?",
                "options": [
                    {"label": "Yes", "isCorrect": False},
                    {"label": "No", "isCorrect": False},
                ],
            },
        ]
    }
    cards, dropped = validate_candidates(raw, "kpop", [], now=now)
    assert len(cards) == 1
    assert cards[0].question_type == "hot"
    assert any(item.endswith(":gambling:stake") for item in dropped)


def test_english_fields_strip_mixed_devanagari() -> None:
    now = datetime(2026, 10, 29, tzinfo=UTC)
    raw = {
        "candidates": [
            {
                "format": "poll",
                "category": "cricket",
                "questionType": "hot",
                "type": "predict",
                "prompt": "Who wins tonight? आज रात कौन जीतेगा?",
                "promptHi": "आज रात कौन जीतेगा?",
                "options": [
                    {"label": "India / भारत", "labelHi": "भारत", "isCorrect": False},
                    {"label": "The other side", "labelHi": "दूसरी टीम", "isCorrect": False},
                ],
            }
        ]
    }
    cards, dropped = validate_candidates(raw, "cricket", [], now=now)
    assert dropped == []
    assert len(cards) == 1
    assert "आज" not in cards[0].prompt
    assert cards[0].prompt.startswith("Who wins tonight")
    # Accidental Hindi from the English agent is discarded — localize_hi owns HI fields.
    assert cards[0].prompt_hi is None
    assert cards[0].options[0]["label"] == "India"
    assert "labelHi" not in cards[0].options[0]


def test_trend_quiz_allows_freeform_well_known_trivia() -> None:
    now = datetime(2026, 10, 29, tzinfo=UTC)
    raw = {
        "candidates": [
            {
                "format": "quiz",
                "category": "cricket",
                "questionType": "trivia",
                "type": "pulse",
                "prompt": "How many players are on the field for one side in cricket?",
                "options": [
                    {"label": "11", "isCorrect": True},
                    {"label": "9", "isCorrect": False},
                    {"label": "7", "isCorrect": False},
                ],
            }
        ]
    }
    cards, dropped = validate_candidates(raw, "cricket", [], now=now)
    assert dropped == []
    assert len(cards) == 1
    assert cards[0].format == "quiz"
    assert cards[0].scoring_mode == "correct_option"
    assert cards[0].question_type == "trivia"


def test_sports_rejects_cricket_prompts() -> None:
    """Sports (Non-Cricket) must not ship cricket takes — they belong under cricket."""
    prompt = "How do you feel about the current state of Indian cricket?"
    assert off_category_topic_issue("sports", prompt) == "cricket-in-sports"
    assert off_category_topic_issue("cricket", prompt) is None
    assert off_category_topic_issue("sports", "Big football derby night. Couch or stands?") is None

    now = datetime(2026, 10, 30, tzinfo=UTC)
    raw = {
        "candidates": [
            {
                "format": "poll",
                "category": "sports",
                "questionType": "debate",
                "type": "predict",
                "prompt": prompt,
                "options": [
                    {"label": "Optimistic about the future", "isCorrect": False},
                    {"label": "Concerned about performance", "isCorrect": False},
                ],
            },
            {
                "format": "poll",
                "category": "sports",
                "questionType": "hot",
                "type": "predict",
                "prompt": "ISL final weekend. Who are you backing?",
                "options": [
                    {"label": "The home side", "isCorrect": False},
                    {"label": "Whoever plays open football", "isCorrect": False},
                ],
            },
        ]
    }
    cards, dropped = validate_candidates(raw, "sports", [], now=now)
    assert any(item.endswith(":cricket-in-sports") for item in dropped)
    assert [card.prompt for card in cards] == ["ISL final weekend. Who are you backing?"]


def test_cricket_rejects_non_cricket_sport_as_main_topic() -> None:
    assert off_category_topic_issue("cricket", "Who wins the football derby tonight?") == "non-cricket-in-cricket"
    assert off_category_topic_issue("cricket", "How many balls in a cricket over?") is None
    assert off_category_topic_issue("sports", "Who wins the football derby tonight?") is None

    now = datetime(2026, 10, 30, tzinfo=UTC)
    raw = {
        "candidates": [
            {
                "format": "poll",
                "category": "cricket",
                "questionType": "debate",
                "type": "predict",
                "prompt": "NBA finals night — LeBron or the underdog?",
                "options": [
                    {"label": "LeBron", "isCorrect": False},
                    {"label": "The underdog", "isCorrect": False},
                ],
            },
            {
                "format": "quiz",
                "category": "cricket",
                "questionType": "trivia",
                "type": "pulse",
                "prompt": "How many balls are there in a standard over?",
                "options": [
                    {"label": "6", "isCorrect": True},
                    {"label": "8", "isCorrect": False},
                    {"label": "4", "isCorrect": False},
                ],
            },
        ]
    }
    cards, dropped = validate_candidates(raw, "cricket", [], now=now)
    assert any(item.endswith(":non-cricket-in-cricket") for item in dropped)
    assert [card.prompt for card in cards] == ["How many balls are there in a standard over?"]


def test_volatile_current_office_quiz_is_rejected_without_brief() -> None:
    assert volatile_fact_issue("Who is the current Chief Minister of Delhi?") == "volatile-fact"
    assert volatile_fact_issue("How many players are on the field for one side in cricket?") is None

    now = datetime(2026, 10, 30, tzinfo=UTC)
    raw = {
        "candidates": [
            {
                "format": "quiz",
                "category": "politics",
                "questionType": "who",
                "type": "pulse",
                "prompt": "Who is the current Chief Minister of Delhi?",
                "options": [
                    {"label": "Arvind Kejriwal", "isCorrect": True},
                    {"label": "Manish Sisodia", "isCorrect": False},
                    {"label": "Rajiv Gandhi", "isCorrect": False},
                ],
            },
            {
                "format": "poll",
                "category": "politics",
                "questionType": "debate",
                "type": "predict",
                "prompt": "Delhi politics tonight — debate heat or mute?",
                "options": [
                    {"label": "Bring the debate", "isCorrect": False},
                    {"label": "Mute and scroll", "isCorrect": False},
                ],
            },
        ]
    }
    cards, dropped = validate_candidates(raw, "politics", [], now=now)
    assert len(cards) == 1
    assert cards[0].format == "poll"
    assert any(item.endswith(":volatile-fact") for item in dropped)


def test_verify_quiz_facts_drops_failed_and_keeps_passed() -> None:
    stable = Card(
        type="pulse",
        category_slug="cricket",
        format="quiz",
        question_type="trivia",
        prompt="How many players are on the field for one side in cricket?",
        options=[
            {"label": "11", "isCorrect": True},
            {"label": "9", "isCorrect": False},
        ],
        scoring_mode="correct_option",
        tags=["quiz"],
    )
    bad = Card(
        type="pulse",
        category_slug="politics",
        format="quiz",
        question_type="who",
        prompt="Who founded the Aam Aadmi Party according to this wrong card?",
        options=[
            {"label": "Wrong name", "isCorrect": True},
            {"label": "Another wrong", "isCorrect": False},
        ],
        scoring_mode="correct_option",
        tags=["quiz"],
    )
    poll = Card(
        type="predict",
        category_slug="politics",
        format="poll",
        question_type="debate",
        prompt="Hot take or soft take on the latest bill?",
        options=[
            {"label": "Hot take", "isCorrect": False},
            {"label": "Soft take", "isCorrect": False},
        ],
        scoring_mode="none",
        tags=["poll"],
    )

    def fake_verify(_messages: list[dict[str, str]]) -> dict:
        return {
            "results": [
                {"id": "0", "verdict": "pass", "reason": "stable rule"},
                {"id": "1", "verdict": "fail", "reason": "wrong answer"},
            ]
        }

    kept, dropped = verify_quiz_facts([stable, bad, poll], call_model=fake_verify)
    assert [c.prompt for c in kept] == [stable.prompt, poll.prompt]
    assert any("fact-fail" in row for row in dropped)


def test_verify_quiz_facts_fails_closed_on_model_error() -> None:
    quiz = Card(
        type="pulse",
        category_slug="tech",
        format="quiz",
        question_type="trivia",
        prompt="What does CPU stand for?",
        options=[
            {"label": "Central Processing Unit", "isCorrect": True},
            {"label": "Computer Power Utility", "isCorrect": False},
        ],
        scoring_mode="correct_option",
        tags=["quiz"],
    )

    def boom(_messages: list[dict[str, str]]) -> dict:
        raise RuntimeError("model down")

    kept, dropped = verify_quiz_facts([quiz], call_model=boom)
    assert kept == []
    assert any("verify-error" in row for row in dropped)


def test_fill_evergreen_uses_the_catalog_when_the_model_is_short() -> None:
    cards = fill_evergreen("kpop", [], MIN_LIVE)
    assert len(cards) >= MIN_LIVE
    assert all(card.category_slug == "kpop" and card.ends_at is None for card in cards)


def test_openrouter_key_uses_gpt4o_mini(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    base, model = resolve_chat_endpoint("sk-or-test")
    assert base == "https://openrouter.ai/api/v1"
    assert model == "openai/gpt-4o-mini"


def test_validate_candidates_discards_hindi_fields_from_english_agent() -> None:
    now = datetime(2026, 10, 29, tzinfo=UTC)
    raw = {
        "candidates": [
            {
                "format": "poll",
                "category": "kpop",
                "questionType": "hot",
                "type": "predict",
                "prompt": "Stream the MV first or learn the chorus?",
                "promptHi": "पहले MV देखोगे या कोरस सीखोगे?",
                "options": [
                    {"label": "Stream the MV", "labelHi": "पहले MV", "isCorrect": False},
                    {"label": "Learn the chorus", "labelHi": "कोरस सीखो", "isCorrect": False},
                ],
            }
        ]
    }
    cards, dropped = validate_candidates(raw, "kpop", [], now=now)
    assert dropped == []
    assert len(cards) == 1
    assert cards[0].prompt_hi is None
    assert "labelHi" not in cards[0].options[0]
    assert cards[0].needs_hi()
    discarded = discard_localization_fields(raw["candidates"][0])
    assert "promptHi" not in discarded
    assert "labelHi" not in discarded["options"][0]


def test_ensure_language_split_separates_en_and_hi() -> None:
    card = Card(
        type="predict",
        category_slug="cinema",
        format="poll",
        question_type="opinion",
        prompt="What's your vibe? आपका वाइब?",
        options=[
            {"label": "Excited! / एक्साइटेड!", "labelHi": "Excited! / बहुत ज़्यादा! 🔥", "isCorrect": False},
            {"label": "Wait for trailer", "labelHi": "ट्रेलर आने दो पहले 👀", "isCorrect": False},
        ],
        scoring_mode="none",
        tags=["poll"],
        prompt_hi="What's your vibe? / कितने एक्साइटेड हो?",
    )
    split = ensure_language_split(card)
    assert "आपका" not in split.prompt
    assert "What's" in split.prompt or "vibe" in split.prompt.lower()
    assert "एक्साइटेड" not in split.options[0]["label"]
    assert "Excited" not in (split.prompt_hi or "")
    assert "एक्साइटेड" in (split.prompt_hi or "")
    assert "Excited" not in split.options[0]["labelHi"]
    assert "बहुत" in split.options[0]["labelHi"]
    assert split.has_complete_hi()


def test_prefer_devanagari_and_strip() -> None:
    from scripts.content_gen.catalog import has_hinglish_latin

    assert strip_devanagari("India / भारत") == "India"
    assert prefer_devanagari("Excited! / बहुत ज़्यादा!") == "बहुत ज़्यादा!"
    # Hinglish Hindi may keep short Latin acronyms/brands; drop English leftovers only.
    assert prefer_devanagari("पहले MV देखोगे?") == "पहले MV देखोगे?"
    assert prefer_devanagari("घर की Maggi") == "घर की Maggi"
    assert prefer_devanagari("कितने एक्साइटेड हो?") == "कितने एक्साइटेड हो?"
    assert has_hinglish_latin("Kitne excited ho for the match?")
    assert has_hinglish_latin("Kya scene hai tonight?")
    assert not has_hinglish_latin("How excited are you for the match?")
    assert not has_hinglish_latin("New trailer just dropped. Watch now?")


def test_localize_hi_fills_missing_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    card = Card(
        type="predict",
        category_slug="food",
        format="poll",
        question_type="opinion",
        prompt="Tea or coffee?",
        options=[{"label": "Tea", "isCorrect": False}, {"label": "Coffee", "isCorrect": False}],
        scoring_mode="none",
        tags=["poll"],
    )
    assert card.needs_hi()

    def fake_openai(messages: list[dict[str, str]]) -> dict:
        assert "Maja Hindi Localization Expert" in messages[0]["content"]
        return {
            "translations": [
                {
                    "id": "0",
                    "promptHi": "चाय या कॉफ़ी?",
                    "optionsHi": ["चाय", "कॉफ़ी"],
                }
            ]
        }

    monkeypatch.setattr("scripts.content_gen.agent.call_openai", fake_openai)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    filled = localize_hi([card])
    assert filled[0].prompt_hi == "चाय या कॉफ़ी?"
    assert filled[0].options[0]["labelHi"] == "चाय"
    assert filled[0].options[1]["labelHi"] == "कॉफ़ी"


def test_localize_hi_rewrite_replaces_draft(monkeypatch: pytest.MonkeyPatch) -> None:
    card = Card(
        type="predict",
        category_slug="movies",
        format="poll",
        question_type="opinion",
        prompt="What's your vibe for the next big Bollywood music release?",
        options=[
            {"label": "Excited!", "isCorrect": False, "labelHi": "एक्साइटेड"},
            {"label": "Cautiously skeptical", "isCorrect": False, "labelHi": "संदेह"},
        ],
        scoring_mode="none",
        tags=["poll"],
        prompt_hi="आपका वाइब क्या है?",
    )
    assert not card.needs_hi()

    def fake_openai(messages: list[dict[str, str]]) -> dict:
        assert "Maja Hindi Localization Expert" in messages[0]["content"]
        return {
            "translations": [
                {
                    "id": "0",
                    "promptHi": "अगली बड़ी बॉलीवुड फ़िल्म को लेकर कितने एक्साइटेड हो?",
                    "optionsHi": ["बहुत ज़्यादा! 🔥", "ट्रेलर आने दो पहले 👀"],
                }
            ]
        }

    monkeypatch.setattr("scripts.content_gen.agent.call_openai", fake_openai)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    filled = localize_hi([card], rewrite=True)
    assert filled[0].prompt_hi == "अगली बड़ी बॉलीवुड फ़िल्म को लेकर कितने एक्साइटेड हो?"
    assert filled[0].options[0]["labelHi"] == "बहुत ज़्यादा! 🔥"

    skipped = localize_hi([card], rewrite=False)
    assert skipped[0].prompt_hi == "आपका वाइब क्या है?"


def test_localize_hi_skips_without_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    card = Card(
        type="predict",
        category_slug="food",
        format="poll",
        question_type="opinion",
        prompt="Tea or coffee?",
        options=[{"label": "Tea", "isCorrect": False}, {"label": "Coffee", "isCorrect": False}],
        scoring_mode="none",
        tags=["poll"],
    )
    out = localize_hi([card])
    assert out[0].prompt_hi is None


def test_missing_openai_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(MissingOpenAIKey):
        require_key()


def test_past_outcome_issue_blocks_closed_season_predictions() -> None:
    today = datetime(2026, 10, 30, tzinfo=UTC).date()
    assert past_outcome_issue("Who will win IPL 2026?", today) == "past-outcome"
    assert past_outcome_issue("Prediction: who wins IPL 2025?", today) == "past-outcome"
    assert past_outcome_issue("Fair Player of the Match for Samson?", today) is None
    assert past_outcome_issue("Prediction: who wins the next match tonight?", today) is None


def test_near_duplicate_prompt_catches_rephrases() -> None:
    assert near_duplicate_prompt(
        "Kohli or Rohit for captain?",
        "Who should captain — Kohli or Rohit?",
    )
    assert not near_duplicate_prompt(
        "Kohli or Rohit for captain?",
        "Midnight craving hits. Street stall or Maggi at home?",
    )


def test_validate_candidates_drops_repeated_star_names() -> None:
    from scripts.content_gen.agent import validate_candidates

    raw = {
        "candidates": [
            {
                "format": "poll",
                "category": "cricket",
                "questionType": "hot",
                "type": "predict",
                "prompt": "Sanju Samson got Player of the Match. Fair?",
                "promptHi": "संजू सैमसन प्लेयर ऑफ द मैच — सही रहा?",
                "options": [
                    {"label": "Fair", "labelHi": "सही", "isCorrect": False},
                    {"label": "Unfair", "labelHi": "गलत", "isCorrect": False},
                ],
                "briefId": None,
            },
            {
                "format": "poll",
                "category": "cricket",
                "questionType": "debate",
                "type": "predict",
                "prompt": "Sanju Samson or Pant behind the stumps?",
                "promptHi": "संजू सैमसन या पंत विकेट के पीछे?",
                "options": [
                    {"label": "Samson", "labelHi": "सैमसन", "isCorrect": False},
                    {"label": "Pant", "labelHi": "पंत", "isCorrect": False},
                ],
                "briefId": None,
            },
            {
                "format": "quiz",
                "category": "cricket",
                "questionType": "trivia",
                "type": "pulse",
                "prompt": "How many balls are there in a standard over?",
                "promptHi": "एक ओवर में कितनी गेंदें होती हैं?",
                "options": [
                    {"label": "6", "labelHi": "६", "isCorrect": True},
                    {"label": "8", "labelHi": "८", "isCorrect": False},
                    {"label": "4", "labelHi": "४", "isCorrect": False},
                ],
                "briefId": None,
            },
        ]
    }
    cards, dropped = validate_candidates(raw, "cricket", [], now=datetime(2026, 10, 30, tzinfo=UTC))
    assert any("name-repeat" in d for d in dropped)
    assert any("How many balls" in c.prompt for c in cards)
    assert sum(1 for c in cards if "Samson" in c.prompt) == 1


def test_validate_candidates_drops_past_outcomes_and_near_dupes() -> None:
    now = datetime(2026, 10, 30, tzinfo=UTC)
    raw = {
        "candidates": [
            {
                "format": "poll",
                "category": "cricket",
                "questionType": "hot",
                "type": "predict",
                "prompt": "Who will win IPL 2026?",
                "promptHi": "आईपीएल २०२६ कौन जीतेगा?",
                "options": [
                    {"label": "Mumbai", "labelHi": "मुंबई", "isCorrect": False},
                    {"label": "Chennai", "labelHi": "चेन्नई", "isCorrect": False},
                ],
            },
            {
                "format": "poll",
                "category": "cricket",
                "questionType": "debate",
                "type": "predict",
                "prompt": "Kohli or Rohit for captain?",
                "promptHi": "कप्तान कौन — कोहली या रोहित?",
                "options": [
                    {"label": "Kohli", "labelHi": "कोहली", "isCorrect": False},
                    {"label": "Rohit", "labelHi": "रोहित", "isCorrect": False},
                ],
            },
            {
                "format": "poll",
                "category": "cricket",
                "questionType": "debate",
                "type": "predict",
                "prompt": "Who should captain — Kohli or Rohit?",
                "promptHi": "कप्तानी किसे दें — कोहली या रोहित?",
                "options": [
                    {"label": "Kohli", "labelHi": "कोहली", "isCorrect": False},
                    {"label": "Rohit", "labelHi": "रोहित", "isCorrect": False},
                ],
            },
            {
                "format": "poll",
                "category": "cricket",
                "questionType": "hot",
                "type": "predict",
                "prompt": "Rain delay. Stay glued or sleep?",
                "promptHi": "बारिश रुकी — जगे रहोगे या सो जाओगे?",
                "options": [
                    {"label": "Stay glued", "labelHi": "जगे रहो", "isCorrect": False},
                    {"label": "Sleep", "labelHi": "सो जाओ", "isCorrect": False},
                ],
            },
        ]
    }
    cards, dropped = validate_candidates(raw, "cricket", [], now=now)
    assert [card.prompt for card in cards] == [
        "Kohli or Rohit for captain?",
        "Rain delay. Stay glued or sleep?",
    ]
    assert any(item.endswith(":past-outcome") for item in dropped)
    assert any(item.endswith(":near-duplicate") for item in dropped)


def test_past_brief_keeps_only_forward_looking_predictions() -> None:
    brief = next(row for row in load_briefs() if row["id"] == "ind-nz-t20-2026-10-22")
    now = datetime(2026, 10, 30, tzinfo=UTC)
    cards = cards_from_brief(brief, now=now)
    kinds = {card.question_type for card in cards}
    assert "prediction" in kinds  # prompt says "next match"
    closed = dict(brief)
    closed["prediction"] = {
        "prompt": "Prediction: who wins this match?",
        "options": ["India", "New Zealand"],
    }
    closed_kinds = {card.question_type for card in cards_from_brief(closed, now=now)}
    assert "prediction" not in closed_kinds


def test_english_agent_system_prompt_forbids_hindi_fields() -> None:
    lowered = EN_SYSTEM.lower()
    assert "english only" in lowered or "natural english only" in lowered
    assert "hindi" in lowered
    assert "devanagari" in lowered
    assert "hinglish" in lowered
    assert "prompthi" in lowered
    assert "labelhi" in lowered
    assert "separate hindi localization" in lowered
    assert "swipe" in lowered
    assert "never invent a trend" in lowered
    assert "trivia" in lowered
    msgs = _messages("food", 4, [], avoid_prompts=[], insights={})
    assert msgs[0]["content"] == EN_SYSTEM
    payload = msgs[1]["content"]
    assert "promptHi" in payload  # forbidden in rules text
    assert "Never generate" in EN_SYSTEM or "never generate" in lowered
    assert "verifiedTrends" in payload
    assert "hindiGood" not in payload
    assert "quizShare" in payload


def test_normalize_verified_trends_marks_completed_events() -> None:
    brief = next(row for row in load_briefs() if row["id"] == "ind-nz-t20-2026-10-22")
    trends = normalize_verified_trends([brief], today=datetime(2026, 10, 30, tzinfo=UTC).date())
    assert len(trends) == 1
    assert trends[0]["eventStatus"] == "completed"
    assert trends[0]["allowPrediction"] is False
    assert "prediction" not in trends[0]["allowedAngles"]


def test_lazy_poll_and_quiz_poll_correctness_gates() -> None:
    assert lazy_poll_issue("poll", "Who is your favourite actor?") == "lazy-poll"
    assert lazy_poll_issue("poll", "Worth the hype or overrated?") is None
    now = datetime(2026, 10, 30, tzinfo=UTC)
    raw = {
        "candidates": [
            {
                "format": "poll",
                "category": "movies",
                "questionType": "opinion",
                "type": "predict",
                "prompt": "Who is your favourite actor?",
                "options": [
                    {"label": "Star A", "isCorrect": False},
                    {"label": "Star B", "isCorrect": False},
                ],
            },
            {
                "format": "quiz",
                "category": "movies",
                "questionType": "trivia",
                "type": "pulse",
                "prompt": "What is the short break mid-film in Indian theatres called?",
                "options": [
                    {"label": "Interval", "isCorrect": True},
                    {"label": "Encore", "isCorrect": True},
                    {"label": "Overture", "isCorrect": False},
                ],
            },
            {
                "format": "poll",
                "category": "movies",
                "questionType": "debate",
                "type": "predict",
                "prompt": "Theatre opening or wait for OTT?",
                "options": [
                    {"label": "Theatre opening", "isCorrect": True},
                    {"label": "Wait for OTT", "isCorrect": False},
                ],
            },
            {
                "format": "quiz",
                "category": "movies",
                "questionType": "trivia",
                "type": "pulse",
                "prompt": "What does OTT stand for in streaming?",
                "options": [
                    {"label": "Over The Top", "isCorrect": True},
                    {"label": "On The Table", "isCorrect": False},
                    {"label": "Open Title Track", "isCorrect": False},
                ],
            },
        ]
    }
    cards, dropped = validate_candidates(raw, "movies", [], now=now)
    assert any(item.endswith(":lazy-poll") for item in dropped)
    assert any(item.endswith(":quiz-correct") for item in dropped)
    assert any(item.endswith(":poll-correct") for item in dropped)
    assert [c.prompt for c in cards] == ["What does OTT stand for in streaming?"]


def test_semantic_duplicate_against_avoid_prompts() -> None:
    now = datetime(2026, 10, 30, tzinfo=UTC)
    assert near_duplicate_prompt(
        "Who is your favourite actor?",
        "Which actor do you love the most?",
        threshold=0.4,
    ) or lazy_poll_issue("poll", "Which actor do you love the most?") == "lazy-poll"
    raw = {
        "candidates": [
            {
                "format": "poll",
                "category": "cricket",
                "questionType": "debate",
                "type": "predict",
                "prompt": "Who should captain — Kohli or Rohit?",
                "options": [
                    {"label": "Kohli", "isCorrect": False},
                    {"label": "Rohit", "isCorrect": False},
                ],
            },
            {
                "format": "poll",
                "category": "movies",
                "questionType": "opinion",
                "type": "predict",
                "prompt": "Which actor do you love the most?",
                "options": [
                    {"label": "Star A", "isCorrect": False},
                    {"label": "Star B", "isCorrect": False},
                ],
            },
        ]
    }
    cricket_cards, cricket_dropped = validate_candidates(
        {"candidates": [raw["candidates"][0]]},
        "cricket",
        [],
        now=now,
        avoid_prompts=["Kohli or Rohit for captain?"],
    )
    assert cricket_cards == []
    assert any(item.endswith(":avoid-near-duplicate") for item in cricket_dropped)

    movie_cards, movie_dropped = validate_candidates(
        {"candidates": [raw["candidates"][1]]},
        "movies",
        [],
        now=now,
    )
    assert movie_cards == []
    assert any(item.endswith(":lazy-poll") for item in movie_dropped)


def test_upcoming_prediction_accepted_completed_rejected() -> None:
    briefs = load_briefs()
    brief = next(row for row in briefs if row["id"] == "movies-weekend-window")
    now = datetime(2026, 10, 23, tzinfo=UTC)  # before eventDate 2026-10-24
    raw = {
        "candidates": [
            {
                "format": "poll",
                "category": "movies",
                "questionType": "prediction",
                "type": "predict",
                "briefId": brief["id"],
                "prompt": "Prediction: will you watch during opening weekend?",
                "options": [
                    {"label": "yes, in a theatre", "isCorrect": False},
                    {"label": "no, later at home", "isCorrect": False},
                ],
            }
        ]
    }
    cards, dropped = validate_candidates(raw, "movies", briefs, now=now)
    assert dropped == []
    assert len(cards) == 1

    # Closed season outcome prediction without a forward-looking brief cue.
    closed_raw = {
        "candidates": [
            {
                "format": "poll",
                "category": "cricket",
                "questionType": "hot",
                "type": "predict",
                "prompt": "Who will win IPL 2026?",
                "options": [
                    {"label": "Mumbai", "isCorrect": False},
                    {"label": "Chennai", "isCorrect": False},
                ],
            }
        ]
    }
    closed_cards, closed_dropped = validate_candidates(
        closed_raw, "cricket", [], now=datetime(2026, 10, 30, tzinfo=UTC)
    )
    assert closed_cards == []
    assert any(item.endswith(":past-outcome") for item in closed_dropped)


def test_brief_supported_fact_accepted_unsupported_rejected() -> None:
    briefs = load_briefs()
    now = datetime(2026, 10, 29, tzinfo=UTC)
    ok = {
        "candidates": [
            {
                "format": "quiz",
                "category": "cricket",
                "questionType": "stat",
                "type": "pulse",
                "briefId": "ind-nz-t20-2026-10-22",
                "prompt": "How many runs did Sanju Samson score?",
                "options": [
                    {"label": "67", "isCorrect": True},
                    {"label": "33", "isCorrect": False},
                    {"label": "102", "isCorrect": False},
                ],
            }
        ]
    }
    cards, dropped = validate_candidates(ok, "cricket", briefs, now=now)
    assert dropped == []
    assert len(cards) == 1

    bad = {
        "candidates": [
            {
                "format": "quiz",
                "category": "cricket",
                "questionType": "stat",
                "type": "pulse",
                "briefId": "ind-nz-t20-2026-10-22",
                "prompt": "How many runs did Virat Kohli score?",
                "options": [
                    {"label": "82", "isCorrect": True},
                    {"label": "67", "isCorrect": False},
                ],
            }
        ]
    }
    bad_cards, bad_dropped = validate_candidates(bad, "cricket", briefs, now=now)
    assert bad_cards == []
    assert bad_dropped


def test_localization_preserves_mechanics_and_uses_hi_system(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    card = Card(
        type="pulse",
        category_slug="cricket",
        format="quiz",
        question_type="trivia",
        prompt="How many balls are there in a standard over?",
        options=[
            {"label": "6", "isCorrect": True},
            {"label": "8", "isCorrect": False},
            {"label": "4", "isCorrect": False},
        ],
        scoring_mode="correct_option",
        tags=["quiz"],
        brief_id="brief-x",
    )

    def fake_openai(messages: list[dict[str, str]]) -> dict:
        assert messages[0]["content"] == HI_LOCALIZE_SYSTEM
        return {
            "translations": [
                {
                    "id": "0",
                    "promptHi": "एक ओवर में कितनी गेंदें होती हैं?",
                    "options": [
                        {"id": "0", "labelHi": "६"},
                        {"id": "1", "labelHi": "८"},
                        {"id": "2", "labelHi": "४"},
                    ],
                }
            ]
        }

    monkeypatch.setattr("scripts.content_gen.agent.call_openai", fake_openai)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    filled = localize_hi([card])
    assert filled[0].prompt == card.prompt
    assert filled[0].brief_id == "brief-x"
    assert filled[0].question_type == "trivia"
    assert [bool(o["isCorrect"]) for o in filled[0].options] == [True, False, False]
    assert [o["label"] for o in filled[0].options] == ["6", "8", "4"]
    assert filled[0].prompt_hi == "एक ओवर में कितनी गेंदें होती हैं?"
    assert filled[0].options[0]["labelHi"] == "६"
    assert localization_preserves_mechanics(card, filled[0])
    assert filled[0].has_complete_hi()

    # Tampered localization that would rewrite English must be rejected by merge safeguards.
    tampered = _apply_hi_row(
        card,
        {"promptHi": "बदला हुआ?", "optionsHi": ["६", "८", "४"]},
    )
    # _apply_hi_row itself keeps English; simulate a broken after-state:
    broken = Card(
        type=card.type,
        category_slug=card.category_slug,
        format=card.format,
        question_type="opinion",  # changed
        prompt="Changed prompt",
        options=card.options,
        scoring_mode=card.scoring_mode,
        tags=card.tags,
        brief_id=card.brief_id,
        prompt_hi="बदला हुआ?",
    )
    assert not localization_preserves_mechanics(card, broken)
    assert localization_preserves_mechanics(card, tampered)


def test_hinglish_latin_rejected_in_english_validation() -> None:
    now = datetime(2026, 10, 30, tzinfo=UTC)
    raw = {
        "candidates": [
            {
                "format": "poll",
                "category": "food",
                "questionType": "hot",
                "type": "predict",
                "prompt": "Kya scene hai for midnight Maggi?",
                "options": [
                    {"label": "Full on", "isCorrect": False},
                    {"label": "Skip", "isCorrect": False},
                ],
            }
        ]
    }
    cards, dropped = validate_candidates(raw, "food", [], now=now)
    assert cards == []
    assert any("english-hinglish" in item for item in dropped)


def test_trends_for_filters_expired_and_wrong_category() -> None:
    now = datetime(2026, 10, 31, 12, 0, tzinfo=UTC)
    rows = [
        {
            "trendId": "alive",
            "topic": "Festival weekend snacks",
            "expiresAt": "2026-11-05T00:00:00Z",
        },
        {
            "trendId": "dead",
            "topic": "Old meme",
            "expiresAt": "2026-10-01T00:00:00Z",
        },
        {
            "trendId": "other-cat",
            "category": "movies",
            "topic": "Wrong file scope",
            "expiresAt": "2026-11-05T00:00:00Z",
        },
        {
            "trendId": "no-topic",
            "expiresAt": "2026-11-05T00:00:00Z",
        },
    ]
    active = trends_for("food", now=now, rows=rows)
    assert [r["trendId"] for r in active] == ["alive"]


def test_merge_verified_trends_includes_manual_and_briefs() -> None:
    now = datetime(2026, 10, 31, 12, 0, tzinfo=UTC)
    manual = [
        {
            "trendId": "food-chai-debate",
            "topic": "Chai vs filter coffee week",
            "trendScore": 88,
            "freshness": "live",
            "indiaRelevance": 100,
            "eventStatus": "live",
            "facts": ["South filter coffee vs North chai debates spike on food reels"],
            "allowedAngles": ["debate", "trivia"],
            "sourceConfidence": "high",
            "expiresAt": "2026-11-10T00:00:00Z",
        }
    ]
    foodish = normalize_manual_trends(manual, slug="food", now=now)
    assert foodish[0]["trendId"] == "food-chai-debate"
    assert foodish[0]["source"] == "manual_trends"

    briefs = [row for row in load_briefs() if row.get("category") == "movies"]
    movie_trends = merge_verified_trends("movies", briefs, now=now)
    assert any(t.get("source") == "brief" for t in movie_trends)

    merged_food = merge_verified_trends("food", [], manual_rows=manual, now=now)
    assert [t["trendId"] for t in merged_food] == ["food-chai-debate"]

    msgs = _messages("food", 4, [], manual_trends=manual, now=now)
    payload = __import__("json").loads(msgs[1]["content"])
    ids = {t["trendId"] for t in payload["verifiedTrends"]}
    assert "food-chai-debate" in ids


def test_unverified_trend_claim_rejected_without_support() -> None:
    assert (
        unverified_trend_claim_issue(
            "This is trending everywhere in India right now — Maggi or roll?",
            brief_id=None,
            verified_trends=[],
        )
        == "unverified-trend"
    )
    supported = [
        {
            "trendId": "food-1",
            "topic": "Maggi late night India",
            "facts": ["Maggi midnight debates spike on food reels"],
        }
    ]
    assert (
        unverified_trend_claim_issue(
            "Maggi is trending for midnight cravings — cup or packet?",
            brief_id=None,
            verified_trends=supported,
        )
        is None
    )

    now = datetime(2026, 10, 31, tzinfo=UTC)
    raw = {
        "candidates": [
            {
                "format": "poll",
                "category": "food",
                "questionType": "hot",
                "type": "predict",
                "prompt": "This is trending everywhere in India right now — Maggi or roll?",
                "options": [
                    {"label": "Maggi", "isCorrect": False},
                    {"label": "Roll", "isCorrect": False},
                ],
            },
            {
                "format": "quiz",
                "category": "food",
                "questionType": "trivia",
                "type": "pulse",
                "prompt": "Milk, tea, and spice simmered together is called?",
                "options": [
                    {"label": "Chai", "isCorrect": True},
                    {"label": "Black coffee", "isCorrect": False},
                    {"label": "A smoothie", "isCorrect": False},
                ],
            },
        ]
    }
    cards, dropped = validate_candidates(raw, "food", [], now=now, verified_trends=[])
    assert any(item.endswith(":unverified-trend") for item in dropped)
    assert [c.prompt for c in cards] == ["Milk, tea, and spice simmered together is called?"]


def test_category_hooks_cover_onboarding_slugs() -> None:
    from scripts.content_gen.agent import _category_rules, _category_scope

    for slug in ONBOARDING_SLUGS:
        scope = _category_scope(slug)
        assert scope.get("label")
        rules = _category_rules(slug)
        assert rules
        assert any("verifiedTrends" in r or "categoryScope" in r for r in rules)
