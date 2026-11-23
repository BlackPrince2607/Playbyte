"""Share-card image rendering — Instagram-story sized PNGs (1080×1350)."""

from __future__ import annotations

import math
from functools import lru_cache
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# Bump when the visual design changes so cached cards regenerate.
CARD_VERSION = "v3"

W, H = 1080, 1350
INK = (21, 14, 43)
CARD = (36, 22, 70)
CARD_DEEP = (28, 17, 56)
PINK = (255, 77, 141)
PINK_SOFT = (255, 177, 196)
LIME = (198, 255, 61)
PAPER = (245, 240, 255)
MUTED = (175, 160, 214)
LILAC = (143, 127, 192)

_ASSETS = Path(__file__).resolve().parent / "assets"


@lru_cache(maxsize=32)
def _font(weight: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    names = {
        "regular": ["NotoSans-Regular.ttf"],
        "semibold": ["NotoSans-SemiBold.ttf", "NotoSans-Bold.ttf"],
        "bold": ["NotoSans-Bold.ttf", "NotoSans-SemiBold.ttf"],
    }
    system = {
        "regular": [
            "C:/Windows/Fonts/segoeui.ttf",
            "C:/Windows/Fonts/arial.ttf",
            "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ],
        "semibold": [
            "C:/Windows/Fonts/seguisb.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
            "/usr/share/fonts/truetype/noto/NotoSans-SemiBold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ],
        "bold": [
            "C:/Windows/Fonts/segoeuib.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
            "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ],
    }
    candidates: list[Path] = [_ASSETS / n for n in names.get(weight, names["regular"])]
    candidates.extend(Path(p) for p in system.get(weight, system["regular"]))
    for path in candidates:
        if path.is_file():
            try:
                return ImageFont.truetype(str(path), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def _text_box(
    draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, xy: tuple[int, int] = (0, 0)
) -> tuple[int, int, int, int]:
    return draw.textbbox(xy, text, font=font)


def _text_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> tuple[int, int]:
    x0, y0, x1, y1 = _text_box(draw, text, font)
    return x1 - x0, y1 - y0


def _center_x(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> int:
    tw, _ = _text_size(draw, text, font)
    return (W - tw) // 2


def _draw_centered(
    draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, y: int, fill: tuple[int, int, int]
) -> tuple[int, int, int, int]:
    """Draw horizontally centered text; return ink bbox at the draw position."""
    x = _center_x(draw, text, font)
    draw.text((x, y), text, font=font, fill=fill)
    return _text_box(draw, text, font, (x, y))


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    words = (text or "").split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        if _text_size(draw, trial, font)[0] <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    capped: list[str] = []
    for line in lines:
        if _text_size(draw, line, font)[0] <= max_width:
            capped.append(line)
            continue
        chunk = ""
        for ch in line:
            trial = chunk + ch
            if chunk and _text_size(draw, trial, font)[0] > max_width:
                capped.append(chunk)
                chunk = ch
            else:
                chunk = trial
        if chunk:
            capped.append(chunk)
    return capped[:4]


def _blend(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def _base_canvas() -> Image.Image:
    img = Image.new("RGB", (W, H), INK)
    px = img.load()
    assert px is not None
    for y in range(H):
        t = y / (H - 1)
        row = _blend((18, 10, 38), (32, 18, 64), t)
        for x in range(W):
            px[x, y] = row

    atmosphere = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ad = ImageDraw.Draw(atmosphere)
    ad.ellipse((480, -280, 1380, 620), fill=(255, 77, 141, 70))
    ad.ellipse((-340, 780, 560, 1620), fill=(198, 255, 61, 48))
    ad.ellipse((80, 240, 1000, 1120), fill=(110, 60, 180, 36))
    img = Image.alpha_composite(img.convert("RGBA"), atmosphere.filter(ImageFilter.GaussianBlur(80))).convert("RGB")

    # Soft frosted panel
    panel = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pd = ImageDraw.Draw(panel)
    pd.rounded_rectangle((48, 48, W - 48, H - 48), radius=60, fill=(*CARD, 232))
    pd.rounded_rectangle((48, 48, W - 48, H - 48), radius=60, outline=(255, 255, 255, 40), width=2)
    img = Image.alpha_composite(img.convert("RGBA"), panel).convert("RGB")
    return img


def _draw_target(draw: ImageDraw.ImageDraw, cx: int, cy: int) -> None:
    rings = (
        (460, (255, 77, 141), 1),
        (360, (143, 127, 192), 2),
        (270, (198, 255, 61), 2),
        (180, (255, 177, 196), 2),
    )
    for r, color, width in rings:
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=color, width=width)
    # Tick marks on outer ring
    for angle_deg in range(0, 360, 30):
        rad = math.radians(angle_deg)
        x0 = cx + int(430 * math.cos(rad))
        y0 = cy + int(430 * math.sin(rad))
        x1 = cx + int(460 * math.cos(rad))
        y1 = cy + int(460 * math.sin(rad))
        draw.line((x0, y0, x1, y1), fill=PINK_SOFT, width=2)


def _draw_sparkles(draw: ImageDraw.ImageDraw) -> None:
    for x, y, r, fill in (
        (112, 168, 3, PINK_SOFT),
        (968, 188, 2, PAPER),
        (160, 1020, 2, LIME),
        (920, 980, 3, PINK_SOFT),
        (220, 390, 2, PAPER),
        (860, 420, 2, LIME),
        (540, 140, 2, PINK_SOFT),
        (980, 720, 2, PAPER),
        (100, 720, 2, LIME),
    ):
        draw.ellipse((x - r, y - r, x + r, y + r), fill=fill)


def _header(draw: ImageDraw.ImageDraw) -> None:
    brand = _font("bold", 56)
    draw.text((92, 92), "MAJA", font=brand, fill=PINK)
    # Live spark
    draw.ellipse((286, 108, 306, 128), fill=LIME)
    draw.ellipse((290, 112, 302, 124), fill=(120, 200, 40))


def _footer(draw: ImageDraw.ImageDraw, challenge: str) -> None:
    draw.rounded_rectangle((400, 1118, 680, 1128), radius=5, fill=PINK)
    challenge_font = _font("bold", 42)
    _draw_centered(draw, challenge, challenge_font, 1148, PAPER)

    cta_font = _font("bold", 34)
    cta = "Play on MAJA"
    probe = _text_box(draw, cta, cta_font)
    ink_w, ink_h = probe[2] - probe[0], probe[3] - probe[1]
    pad_x, pad_y = 32, 14
    pw, ph = ink_w + pad_x * 2, ink_h + pad_y * 2
    px0 = (W - pw) // 2
    py0 = 1220
    draw.rounded_rectangle((px0, py0, px0 + pw, py0 + ph), radius=ph // 2, fill=PINK)
    draw.text((px0 + pad_x - probe[0], py0 + pad_y - probe[1]), cta, font=cta_font, fill=PAPER)


def _soft_glow(img: Image.Image, box: tuple[int, int, int, int], color: tuple[int, int, int], alpha: int = 55) -> Image.Image:
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse(box, fill=(*color, alpha))
    return Image.alpha_composite(img.convert("RGBA"), glow.filter(ImageFilter.GaussianBlur(36))).convert("RGB")


def _outlined_pill(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.ImageFont,
    cy: int,
    *,
    fill: tuple[int, int, int],
    outline: tuple[int, int, int],
    text_fill: tuple[int, int, int],
) -> None:
    probe = _text_box(draw, text, font)
    ink_w, ink_h = probe[2] - probe[0], probe[3] - probe[1]
    pad_x, pad_y = 36, 18
    pw, ph = ink_w + pad_x * 2, ink_h + pad_y * 2
    px0 = (W - pw) // 2
    py0 = cy - ph // 2
    draw.rounded_rectangle((px0, py0, px0 + pw, py0 + ph), radius=ph // 2, fill=fill)
    draw.rounded_rectangle((px0, py0, px0 + pw, py0 + ph), radius=ph // 2, outline=outline, width=3)
    tx = px0 + pad_x - probe[0]
    ty = py0 + pad_y - probe[1]
    draw.text((tx, ty), text, font=font, fill=text_fill)


def render_play_card(
    title: str,
    score: int,
    *,
    detail: str | None = None,
    brag: str | None = None,
) -> bytes:
    img = _base_canvas()
    draw = ImageDraw.Draw(img)
    _draw_target(draw, W // 2, 560)
    _draw_sparkles(draw)
    _header(draw)

    # Game chip
    chip_font = _font("semibold", 30)
    chip = (title or "Game").strip().upper()[:36]
    probe = _text_box(draw, chip, chip_font)
    ink_w, ink_h = probe[2] - probe[0], probe[3] - probe[1]
    pad_x, pad_y = 24, 12
    chip_w, chip_h = ink_w + pad_x * 2, ink_h + pad_y * 2
    cx0 = (W - chip_w) // 2
    cy0 = 200
    draw.rounded_rectangle((cx0, cy0, cx0 + chip_w, cy0 + chip_h), radius=chip_h // 2, fill=(55, 34, 100))
    draw.rounded_rectangle((cx0, cy0, cx0 + chip_w, cy0 + chip_h), radius=chip_h // 2, outline=PINK_SOFT, width=2)
    draw.text((cx0 + pad_x - probe[0], cy0 + pad_y - probe[1]), chip, font=chip_font, fill=PINK_SOFT)

    label_font = _font("regular", 36)
    _draw_centered(draw, "I scored", label_font, 300, MUTED)

    score_text = f"{score:,}"
    score_font = _font("bold", 230 if len(score_text) <= 3 else 190 if len(score_text) <= 5 else 140)
    # Anchor so glyph ink (not the font em-box) sits where we want it.
    probe = _text_box(draw, score_text, score_font)
    ink_w, ink_h = probe[2] - probe[0], probe[3] - probe[1]
    sx = (W - ink_w) // 2 - probe[0]
    sy = 420 - probe[1]
    ink = (sx + probe[0], sy + probe[1], sx + probe[2], sy + probe[3])
    img = _soft_glow(img, (ink[0] - 40, ink[1] - 20, ink[2] + 40, ink[3] + 50), LIME, alpha=70)
    draw = ImageDraw.Draw(img)
    draw.text((sx, sy), score_text, font=score_font, fill=LIME)
    # Underline accent just below glyph ink
    draw.rounded_rectangle((ink[0] + 20, ink[3] + 14, ink[2] - 20, ink[3] + 26), radius=6, fill=LIME)

    y = ink[3] + 56
    if detail:
        detail_font = _font("semibold", 32)
        _outlined_pill(
            draw,
            detail[:48],
            detail_font,
            y + 24,
            fill=CARD_DEEP,
            outline=LILAC,
            text_fill=PAPER,
        )
        y += 90
    if brag:
        brag_font = _font("bold", 34)
        _outlined_pill(
            draw,
            brag[:56],
            brag_font,
            y + 28,
            fill=(42, 62, 24),
            outline=LIME,
            text_fill=LIME,
        )

    _footer(draw, "Can you beat me?")

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def render_moment_card(prompt: str, answer: str) -> bytes:
    img = _base_canvas()
    draw = ImageDraw.Draw(img)
    _draw_target(draw, W // 2, 620)
    _draw_sparkles(draw)
    _header(draw)

    prompt_font = _font("semibold", 44)
    lines = _wrap(draw, (prompt or "Moment").strip(), prompt_font, max_width=860)
    y = 210
    for line in lines:
        draw.text((_center_x(draw, line, prompt_font), y), line, font=prompt_font, fill=PAPER)
        y += 58

    label_font = _font("regular", 34)
    label = "I chose"
    draw.text((_center_x(draw, label, label_font), min(y + 28, 420)), label, font=label_font, fill=MUTED)

    answer_text = (answer or "?").strip()[:64]
    answer_font = _font("bold", 96 if len(answer_text) <= 16 else 68 if len(answer_text) <= 28 else 48)
    answer_lines = _wrap(draw, answer_text, answer_font, max_width=860)

    # Estimate block height for glow
    block_h = sum(_text_size(draw, line, answer_font)[1] + 16 for line in answer_lines)
    ay = 520
    img = _soft_glow(img, (160, ay - 20, 920, ay + block_h + 60), LIME, alpha=60)
    draw = ImageDraw.Draw(img)

    # Answer glass plate
    plate = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pd = ImageDraw.Draw(plate)
    plate_top = ay - 36
    plate_bot = ay + block_h + 28
    pd.rounded_rectangle((120, plate_top, W - 120, plate_bot), radius=36, fill=(255, 255, 255, 18))
    pd.rounded_rectangle((120, plate_top, W - 120, plate_bot), radius=36, outline=(198, 255, 61, 90), width=2)
    img = Image.alpha_composite(img.convert("RGBA"), plate).convert("RGB")
    draw = ImageDraw.Draw(img)

    for line in answer_lines:
        draw.text((_center_x(draw, line, answer_font), ay), line, font=answer_font, fill=LIME)
        ay += _text_size(draw, line, answer_font)[1] + 16

    _footer(draw, "Join the crowd")

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
