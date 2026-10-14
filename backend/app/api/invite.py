"""Public invite links. With the app installed Android opens /add/{code} straight in MAJA (App Links);
otherwise this page explains how to get the app and still offers the code."""

from html import escape
from urllib.parse import quote

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.infrastructure.postgres.db import get_session
from app.infrastructure.postgres.models import Profile
from app.modules.friends.codes import format_code, parse_code
from app.modules.friends.service import find_by_code

router = APIRouter(tags=["invite"])


@router.get("/.well-known/assetlinks.json")
async def assetlinks() -> list[dict]:
    settings = get_settings()
    prints = [p.strip().upper() for p in settings.android_cert_sha256.split(",") if p.strip()]
    return [
        {
            "relation": ["delegate_permission/common.handle_all_urls"],
            "target": {
                "namespace": "android_app",
                "package_name": settings.android_package,
                "sha256_cert_fingerprints": prints,
            },
        }
    ]


@router.get("/add/{raw_code}", response_class=HTMLResponse)
async def invite_page(raw_code: str, session: AsyncSession = Depends(get_session)) -> HTMLResponse:
    code = parse_code(raw_code)
    if code is None:
        return HTMLResponse(
            _page("This invite link isn't valid", "Ask your friend to send it again.", None), 404
        )
    owner = await find_by_code(session, code)
    profile = await session.get(Profile, owner.id) if owner else None
    name = profile.display_name if profile and profile.default_visibility != "private" else None
    title = f"{name} invited you to MAJA" if name else "You're invited to MAJA"
    return HTMLResponse(
        _page(title, "Play quick games and polls together. Every swipe is a game.", code)
    )


def _page(title: str, body: str, code: str | None) -> str:
    settings = get_settings()
    actions = ""
    if code:
        fallback = settings.app_download_url or ""
        intent = f"intent://add/{code}#Intent;scheme=maja;package={settings.android_package};"
        if fallback:
            intent += f"S.browser_fallback_url={quote(fallback, safe='')};"
        intent += "end"
        actions += f'<a class="btn primary" href="{escape(intent)}">Open in MAJA</a>'
        if fallback:
            actions += f'<a class="btn" href="{escape(fallback)}">Get the app</a>'
        actions += (
            '<p class="hint">Already have MAJA? Open Friends and enter this code:</p>'
            f'<p class="code">{format_code(code)}</p>'
        )
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(title)}</title>
<meta property="og:title" content="{escape(title)}">
<meta property="og:description" content="{escape(body)}">
<style>
body{{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#150E2B;color:#F6F1FF;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}}
main{{max-width:360px;padding:32px 24px;text-align:center}}
.logo{{font-size:40px;font-weight:800;letter-spacing:1px;color:#FF4D8D;margin:0 0 24px}}
h1{{font-size:24px;line-height:1.25;margin:0 0 12px}}
p{{color:#B9A9E6;line-height:1.5;margin:0 0 20px}}
.btn{{display:block;padding:14px;border-radius:999px;margin:0 0 12px;font-weight:700;
text-decoration:none;color:#F6F1FF;border:1px solid #3B2D6B}}
.primary{{background:#C6FF3D;color:#150E2B;border-color:#C6FF3D}}
.hint{{margin:20px 0 6px;font-size:14px}}
.code{{font-family:ui-monospace,Menlo,monospace;font-size:28px;letter-spacing:3px;color:#C6FF3D;margin:0}}
</style></head>
<body><main><p class="logo">MAJA</p><h1>{escape(title)}</h1><p>{escape(body)}</p>{actions}</main></body></html>"""
