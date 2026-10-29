"""Engagement summary helpers used by the refresh agent."""

from app.modules.feed.insights import summarize_for_agent


def test_summarize_for_agent_prefers_hits_and_avoids_all_prompts() -> None:
    rows = [
        {
            "id": "1",
            "categorySlug": "cricket",
            "format": "poll",
            "prompt": "Who wins tonight?",
            "responses": 40,
            "likes": 12,
            "comments": 3,
            "shares": 2,
            "score": 40 + 24 + 9 + 4,
            "optionCount": 2,
        },
        {
            "id": "2",
            "categorySlug": "cricket",
            "format": "quiz",
            "prompt": "Obscure 1983 fact nobody cares about",
            "responses": 0,
            "likes": 0,
            "comments": 0,
            "shares": 0,
            "score": 0.0,
            "optionCount": 4,
        },
        {
            "id": "3",
            "categorySlug": "movies",
            "format": "poll",
            "prompt": "Other category",
            "responses": 99,
            "likes": 0,
            "comments": 0,
            "shares": 0,
            "score": 99.0,
            "optionCount": 2,
        },
    ]
    summary = summarize_for_agent(rows, "cricket")
    assert summary["category"] == "cricket"
    assert summary["hits"][0]["prompt"].startswith("Who wins")
    assert any("Obscure" in m["prompt"] for m in summary["misses"])
    assert "Who wins tonight?" in summary["avoidPrompts"]
    assert summary["lessons"]
    assert summarize_for_agent(rows, "food")["hits"] == []
