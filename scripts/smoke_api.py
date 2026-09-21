"""Live API smoke test against Railway preview."""
from __future__ import annotations

import json
import sys
import uuid

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://playbyte-production.up.railway.app"


def main() -> int:
    c = httpx.Client(timeout=30.0)
    results: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, ok, detail))
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))

    h = c.get(f"{BASE}/health")
    check("GET /health", h.status_code == 200 and h.json().get("ok") is True, h.text[:120])

    r = c.get(f"{BASE}/ready")
    check(
        "GET /ready",
        r.status_code == 200 and r.json().get("database") == "up",
        r.text[:120],
    )

    g = c.post(f"{BASE}/v1/guest/sessions", json={})
    token = g.json().get("token") if g.is_success else None
    check("POST /v1/guest/sessions", bool(token), g.text[:200])
    if not token:
        _print_summary(results)
        return 1

    auth = {"Authorization": f"Bearer {token}"}

    feed = c.get(f"{BASE}/v1/feed", params={"limit": 20}, headers=auth)
    items = feed.json().get("items", []) if feed.is_success else []
    check("GET /v1/feed", feed.is_success and len(items) > 0, f"status={feed.status_code} items={len(items)}")

    cats = c.get(f"{BASE}/v1/categories")
    cat_payload = cats.json() if cats.is_success else {}
    cat_list = cat_payload.get("categories", cat_payload if isinstance(cat_payload, list) else [])
    check("GET /v1/categories", cats.is_success and len(cat_list) > 0, f"n={len(cat_list)}")

    games = c.get(f"{BASE}/v1/games", headers=auth)
    game_payload = games.json() if games.is_success else {}
    game_list = game_payload.get("games", game_payload if isinstance(game_payload, list) else [])
    check("GET /v1/games", games.is_success and len(game_list) > 0, f"n={len(game_list)}")
    for ginfo in game_list:
        print(f"    game {ginfo.get('key')}")

    moment = next((i for i in items if i.get("type") == "moment"), None)
    if moment and moment.get("options"):
        opt = moment["options"][0]["id"]
        idem = f"smoke-{uuid.uuid4()}"
        resp = c.post(
            f"{BASE}/v1/moments/{moment['id']}/responses",
            headers={**auth, "Idempotency-Key": idem, "Content-Type": "application/json"},
            json={"optionId": opt},
        )
        check(
            "POST /v1/moments/{id}/responses",
            resp.status_code in (200, 201),
            f"{resp.status_code} {resp.text[:180]}",
        )

        result = c.get(f"{BASE}/v1/moments/{moment['id']}/result", headers=auth)
        check(
            "GET /v1/moments/{id}/result",
            result.is_success,
            f"{result.status_code} {result.text[:180]}",
        )

        share = c.post(f"{BASE}/v1/moments/{moment['id']}/share-card", headers=auth)
        share_ok = share.status_code == 200 and bool(share.json().get("assetUrl"))
        check(
            "POST /v1/moments/{id}/share-card",
            share_ok,
            f"{share.status_code} {share.text[:250]}",
        )
    else:
        check("POST /v1/moments/{id}/responses", False, "no moment with options in feed")
        check("GET /v1/moments/{id}/result", False, "skipped")
        check("POST /v1/moments/{id}/share-card", False, "skipped")

    if game_list:
        key = game_list[0]["key"]
        play = c.post(
            f"{BASE}/v1/games/{key}/plays",
            headers={
                **auth,
                "Idempotency-Key": f"play-{uuid.uuid4()}",
                "Content-Type": "application/json",
            },
            json={"score": 42, "durationMs": 1500},
        )
        check(
            f"POST /v1/games/{key}/plays",
            play.is_success,
            f"{play.status_code} {play.text[:200]}",
        )
    else:
        check("POST /v1/games/{key}/plays", False, "no games")

    # Unauthorized without token
    unauth = c.get(f"{BASE}/v1/feed")
    check("GET /v1/feed without auth -> 401", unauth.status_code == 401, str(unauth.status_code))

    # Invalid token
    bad = c.get(f"{BASE}/v1/feed", headers={"Authorization": "Bearer gst_invalid"})
    check("GET /v1/feed bad token -> 401", bad.status_code == 401, str(bad.status_code))

    return _print_summary(results)


def _print_summary(results: list[tuple[str, bool, str]]) -> int:
    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    print(f"\nSummary: {passed} passed, {failed} failed of {len(results)}")
    print(json.dumps([{"name": n, "ok": ok, "detail": d} for n, ok, d in results], indent=2))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
