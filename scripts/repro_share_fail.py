"""One-off: reproduce Railway share-card failure."""
import uuid

import httpx

BASE = "https://playbyte-production.up.railway.app"


def main() -> None:
    c = httpx.Client(timeout=45.0)
    g = c.post(f"{BASE}/v1/guest/sessions", json={}).json()
    h = {"Authorization": f"Bearer {g['token']}"}
    items = c.get(f"{BASE}/v1/feed", params={"limit": 5}, headers=h).json()["items"]
    m = next(i for i in items if i.get("type") == "moment" and i.get("options"))
    idem = str(uuid.uuid4())
    r = c.post(
        f"{BASE}/v1/moments/{m['id']}/responses",
        headers={**h, "Idempotency-Key": idem, "Content-Type": "application/json"},
        json={"optionId": m["options"][0]["id"]},
    )
    print("respond", r.status_code)
    sc = c.post(f"{BASE}/v1/moments/{m['id']}/share-card", headers=h)
    print("share", sc.status_code, sc.text[:400])


if __name__ == "__main__":
    main()
