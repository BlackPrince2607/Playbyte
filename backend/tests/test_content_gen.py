"""Catalog, brief, and agent-gate tests. They do not call OpenAI."""

from datetime import UTC, datetime

import pytest

from scripts.content_gen.agent import (
    MissingOpenAIKey,
    ensure_language_split,
    fill_evergreen,
    localize_hi,
    near_duplicate_prompt,
    past_outcome_issue,
    require_key,
    resolve_chat_endpoint,
    validate_candidates,
    verify_quiz_facts,
    volatile_fact_issue,
)
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
    prefer_devanagari,
    strip_devanagari,
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
    assert cards[0].prompt_hi == "आज रात कौन जीतेगा?"
    assert cards[0].options[0]["label"] == "India"
    assert cards[0].options[0]["labelHi"] == "भारत"


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


def test_validate_candidates_keeps_hindi_fields() -> None:
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
    assert cards[0].prompt_hi == "पहले MV देखोगे या कोरस सीखोगे?"
    assert cards[0].options[0]["labelHi"] == "पहले MV"
    assert not cards[0].needs_hi()


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

    def fake_openai(_messages: list[dict[str, str]]) -> dict:
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
