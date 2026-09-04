def test_gambling_language_rejected() -> None:
    text = "place a wager on the odds"
    assert any(w in text for w in ("odds", "payout", "bet", "stake", "wager"))
