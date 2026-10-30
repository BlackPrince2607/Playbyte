import random
import re
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.infrastructure.postgres.models import (
    ContentTag,
    ContentWindow,
    CrowdSnapshot,
    Friendship,
    GuestInterest,
    MiniGame,
    Moment,
    MomentTag,
    Profile,
    Response,
    ResponseVisibility,
    UserInterest,
)
from app.infrastructure.storage.objects import get_object_storage
from app.modules.crowd.volume import volume_state
from app.modules.feed.ranking import FeedCursor, RankedItem, fill_page, moment_score, rotate_games
from app.modules.social.service import EMPTY_ENGAGEMENT, engagement_for

# Random score added per request: reshuffles moments within the same tier (interest match is +100,
# freshness up to +50) while active-window moments (+1000) still lead.
MOMENT_JITTER = 100.0
# Keep unanswered polls/quizzes ahead of ones the viewer already picked; answered cards still recycle
# so the feed does not collapse to games-only.
UNANSWERED_BOOST = 10_000.0
_DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]+")
_MULTI_SPACE_RE = re.compile(r"\s{2,}")


def _latin_display(text: str | None) -> str:
    """English UI: strip Devanagari that leaked into the English prompt/label columns."""
    if not text:
        return ""
    cleaned = _DEVANAGARI_RE.sub(" ", text)
    cleaned = re.sub(r"\s*[|/·]+\s*", " ", cleaned)
    cleaned = _MULTI_SPACE_RE.sub(" ", cleaned).strip(" -")
    # Drop a second trailing ? / ! left behind after removing the Hindi half.
    cleaned = re.sub(r"([?!])\s*[?!]+$", r"\1", cleaned)
    return cleaned.strip()


_LATIN_TOKEN_RE = re.compile(r"(?:^|\s)[A-Za-z][A-Za-z0-9''!?.%&-]{0,40}(?=\s|$)")


def _hindi_display(text: str | None) -> str:
    """Hindi UI: keep Devanagari; drop Latin-only bilingual halves like 'Excited! / एक्साइटेड'."""
    if not text:
        return ""
    raw = text.strip()
    if not _DEVANAGARI_RE.search(raw):
        return raw
    cleaned = re.sub(r"\s*[|/·]+\s*", " ", raw)
    cleaned = _LATIN_TOKEN_RE.sub(" ", cleaned)
    cleaned = _MULTI_SPACE_RE.sub(" ", cleaned).strip()
    cleaned = re.sub(r"([?!])\s*[?!]+$", r"\1", cleaned).strip()
    return cleaned or raw


def media_url(key: str | None) -> str | None:
    if not key:
        return None
    return get_object_storage().public_url("moment-media", key)


async def interest_ids(session: AsyncSession, user_id: UUID | None, guest_id: UUID | None) -> set[UUID]:
    if user_id:
        rows = await session.scalars(select(UserInterest.category_id).where(UserInterest.user_id == user_id))
        return set(rows)
    if guest_id:
        rows = await session.scalars(
            select(GuestInterest.category_id).where(GuestInterest.guest_session_id == guest_id)
        )
        return set(rows)
    return set()


async def load_live_moments(session: AsyncSession) -> list[Moment]:
    now = datetime.now(UTC)
    stmt = (
        select(Moment)
        .options(selectinload(Moment.options), selectinload(Moment.category))
        .where(Moment.status == "live")
        .where(or_(Moment.starts_at.is_(None), Moment.starts_at <= now))
        .where(or_(Moment.ends_at.is_(None), Moment.ends_at > now))
    )
    return list(await session.scalars(stmt))


async def tags_for_moments(session: AsyncSession, moment_ids: list[UUID]) -> dict[UUID, list[dict]]:
    if not moment_ids:
        return {}
    rows = await session.execute(
        select(MomentTag.moment_id, ContentTag)
        .join(ContentTag, ContentTag.id == MomentTag.tag_id)
        .where(MomentTag.moment_id.in_(moment_ids))
    )
    out: dict[UUID, list[dict]] = {mid: [] for mid in moment_ids}
    for moment_id, tag in rows:
        out.setdefault(moment_id, []).append({"slug": tag.slug, "name": tag.name})
    return out


async def active_window_ids(session: AsyncSession) -> set[UUID]:
    now = datetime.now(UTC)
    rows = await session.scalars(
        select(ContentWindow.id).where(
            ContentWindow.status == "active",
            ContentWindow.starts_at <= now,
            ContentWindow.ends_at > now,
        )
    )
    return set(rows)


async def answered_moment_ids(
    session: AsyncSession, moment_ids: list[UUID], user_id: UUID | None, guest_id: UUID | None
) -> set[UUID]:
    if not moment_ids or not (user_id or guest_id):
        return set()
    owner = Response.user_id == user_id if user_id else Response.guest_session_id == guest_id
    rows = await session.scalars(select(Response.moment_id).where(Response.moment_id.in_(moment_ids), owner))
    return set(rows)


async def my_option_ids(
    session: AsyncSession, moment_ids: list[UUID], user_id: UUID | None, guest_id: UUID | None
) -> dict[UUID, UUID]:
    if not moment_ids or not (user_id or guest_id):
        return {}
    owner = Response.user_id == user_id if user_id else Response.guest_session_id == guest_id
    rows = await session.execute(
        select(Response.moment_id, Response.option_id).where(Response.moment_id.in_(moment_ids), owner)
    )
    return {moment_id: option_id for moment_id, option_id in rows}


def _wants_hindi(lang: str | None) -> bool:
    return bool(lang) and lang.lower().startswith("hi")


async def build_feed(
    session: AsyncSession,
    *,
    user_id: UUID | None,
    guest_id: UUID | None,
    limit: int = 10,
    cursor: str | None = None,
    rng: random.Random | None = None,
    lang: str | None = None,
) -> dict:
    """One page of the endless feed: live moments ranked with unanswered first, then recycled answered
    cards, interleaved with games. The cursor continues (and reshuffles once every moment has been shown)."""
    rng = rng or random.Random()
    new_seed = lambda: rng.getrandbits(31)  # noqa: E731
    position = (cursor and FeedCursor.decode(cursor)) or FeedCursor(new_seed(), 0, new_seed(), 0)
    interests = await interest_ids(session, user_id, guest_id)
    windows = await active_window_ids(session)
    loaded = await load_live_moments(session)
    answered = await answered_moment_ids(session, [m.id for m in loaded], user_id, guest_id)
    # Preference picks are the pool. If those categories have nothing live yet, widen so the feed works.
    moments = [m for m in loaded if m.category_id in interests] if interests else loaded
    if interests and not moments:
        moments = loaded
    now = datetime.now(UTC)
    by_id = {m.id: m for m in moments}
    base_scores = {
        str(m.id): moment_score(
            now=now,
            starts_at=m.starts_at,
            in_active_window=m.content_window_id in windows if m.content_window_id else False,
            interest_match=m.category_id in interests,
        )
        + (0.0 if m.id in answered else UNANSWERED_BOOST)
        for m in sorted(moments, key=lambda m: str(m.id))
    }

    def rank_moments(seed: int) -> list[RankedItem]:
        """Mix preference categories and card kinds (quiz vs poll) so the feed does not feel samey."""
        jitter = random.Random(seed)
        # category -> format -> ranked items
        by_cat_fmt: dict[str, dict[str, list[RankedItem]]] = {}
        for mid, base in base_scores.items():
            m = by_id[UUID(mid)]
            fmt = "quiz" if getattr(m, "scoring_mode", None) == "correct_option" else "poll"
            item = RankedItem(
                kind="moment",
                id=mid,
                score=base + jitter.uniform(0, MOMENT_JITTER),
            )
            by_cat_fmt.setdefault(str(m.category_id), {}).setdefault(fmt, []).append(item)
        for formats in by_cat_fmt.values():
            for rows in formats.values():
                rows.sort(key=lambda x: x.score, reverse=True)
        cat_ids = list(by_cat_fmt.keys())
        jitter.shuffle(cat_ids)
        fmt_order = ["quiz", "poll"]
        jitter.shuffle(fmt_order)
        ranked: list[RankedItem] = []
        # Outer: categories; inner: alternate quiz/poll so picks and kinds both rotate.
        while any(any(rows) for formats in by_cat_fmt.values() for rows in formats.values()):
            for c in cat_ids:
                formats = by_cat_fmt.get(c) or {}
                for fmt in fmt_order:
                    rows = formats.get(fmt) or []
                    if rows:
                        ranked.append(rows.pop(0))
                        break
            fmt_order.reverse()
        return ranked

    games = list(
        await session.scalars(
            select(MiniGame).where(MiniGame.status == "enabled").order_by(MiniGame.sort_order, MiniGame.key)
        )
    )

    def rank_games(seed: int) -> list[RankedItem]:
        rotated = rotate_games(games, lambda g: getattr(g, "engine", None), random.Random(seed))
        return [RankedItem(kind="mini_game", id=g.key, score=float(100 - g.sort_order)) for g in rotated]

    ordered, next_cursor = fill_page(
        rank_moments=rank_moments,
        rank_games=rank_games,
        cursor=position,
        exclude=set(),
        limit=limit,
        cadence=4 if windows else 2,
        new_seed=new_seed,
    )

    shown_ids = [UUID(i.id) for i in ordered if i.kind == "moment"]
    snapshots = {}
    mine = await my_option_ids(session, shown_ids, user_id, guest_id)
    if shown_ids:
        snapshots = {
            s.moment_id: s
            for s in await session.scalars(select(CrowdSnapshot).where(CrowdSnapshot.moment_id.in_(shown_ids)))
        }
    tag_map = await tags_for_moments(session, shown_ids)
    engagement = await engagement_for(session, shown_ids, user_id, guest_id)
    game_map = {g.key: g for g in games}
    items: list[dict] = []
    for item in ordered:
        if item.kind == "moment":
            m = by_id[UUID(item.id)]
            my_option = mine.get(m.id)
            payload = serialize_moment(
                m,
                snapshots.get(m.id),
                my_option,
                tags=tag_map.get(m.id, []),
                reveal_correct=my_option is not None and m.scoring_mode == "correct_option",
                lang=lang,
            )
            payload["engagement"] = engagement.get(m.id) or dict(EMPTY_ENGAGEMENT)
            items.append(payload)
        else:
            g = game_map[item.id]
            items.append(serialize_game(g))
    return {"items": items, "cursor": next_cursor.encode() if next_cursor else None}


def serialize_game(g: MiniGame) -> dict:
    out = {
        "type": "mini_game",
        "key": g.key,
        "title": g.title,
        "blurb": g.blurb,
        "config": g.config or {},
    }
    if getattr(g, "engine", None):
        out["engine"] = g.engine
        out["variation"] = g.variation
    return out


def serialize_moment(
    m: Moment,
    snap: CrowdSnapshot | None,
    my_option_id: UUID | None,
    *,
    tags: list[dict] | None = None,
    reveal_correct: bool = False,
    lang: str | None = None,
) -> dict:
    options = sorted(m.options, key=lambda o: o.sort_order)
    correct_id = None
    if reveal_correct and m.scoring_mode == "correct_option":
        for o in options:
            if o.is_correct:
                correct_id = str(o.id)
                break
    hindi = _wants_hindi(lang)
    prompt_hi = getattr(m, "prompt_hi", None)
    if hindi:
        # Hindi settings: show Hindi layer only. Fall back to English only if hi is missing.
        hi_prompt = _hindi_display(prompt_hi)
        if hi_prompt and _DEVANAGARI_RE.search(hi_prompt):
            prompt = hi_prompt
        else:
            prompt = _latin_display(m.prompt) or m.prompt
    else:
        # English settings: English layer only — never Devanagari.
        prompt = _latin_display(m.prompt) or m.prompt
    return {
        "type": "moment",
        "id": str(m.id),
        "cardType": m.type,
        "prompt": prompt,
        "promptImageUrl": media_url(m.prompt_image_key),
        "scoringMode": m.scoring_mode,
        "tags": tags or [],
        "category": {"slug": m.category.slug, "name": m.category.name} if m.category else None,
        "status": m.status,
        "startsAt": m.starts_at.isoformat() if m.starts_at else None,
        "endsAt": m.ends_at.isoformat() if m.ends_at else None,
        "options": [
            {
                "id": str(o.id),
                "label": (
                    (
                        (
                            _hindi_display(getattr(o, "label_hi", None))
                            if getattr(o, "label_hi", None)
                            and _DEVANAGARI_RE.search(str(getattr(o, "label_hi", None) or ""))
                            else None
                        )
                        or _latin_display(o.label)
                        or o.label
                        or ""
                    )
                    if hindi
                    else (_latin_display(o.label) or o.label)
                ),
                "imageUrl": media_url(o.image_key),
                "sortOrder": o.sort_order,
            }
            for o in options
        ],
        "myOptionId": str(my_option_id) if my_option_id else None,
        "result": serialize_snapshot(m.id, snap, correct_option_id=correct_id) if snap or correct_id else (
            {"correctOptionId": correct_id, "totalResponses": 0, "optionCounts": {}} if correct_id else None
        ),
    }


def serialize_snapshot(
    moment_id: UUID,
    snap: CrowdSnapshot | None,
    *,
    correct_option_id: str | None = None,
) -> dict | None:
    if snap is None and not correct_option_id:
        return None
    if snap is None:
        return {
            "event": "crowd.snapshot",
            "momentId": str(moment_id),
            "version": 0,
            "generatedAt": None,
            "totalResponses": 0,
            "optionCounts": {},
            "joinedLastMinute": 0,
            "volumeState": "nascent",
            "correctOptionId": correct_option_id,
        }
    return {
        "event": "crowd.snapshot",
        "momentId": str(moment_id),
        "version": snap.version,
        "generatedAt": snap.generated_at.isoformat() if snap.generated_at else None,
        "totalResponses": snap.total_responses,
        "optionCounts": snap.option_counts,
        "joinedLastMinute": snap.joined_last_minute,
        "volumeState": snap.volume_state or volume_state(snap.total_responses),
        "correctOptionId": correct_option_id,
    }


async def my_response(
    session: AsyncSession, moment_id: UUID, user_id: UUID | None, guest_id: UUID | None
) -> Response | None:
    stmt = select(Response).where(Response.moment_id == moment_id)
    if user_id:
        stmt = stmt.where(Response.user_id == user_id)
    elif guest_id:
        stmt = stmt.where(Response.guest_session_id == guest_id)
    else:
        return None
    return await session.scalar(stmt)


async def friends_on_moment(
    session: AsyncSession, viewer_id: UUID, moment_id: UUID
) -> list[dict]:
    """Server-side privacy: never return Private responses."""
    pairs = await session.scalars(
        select(Friendship).where(
            Friendship.status == "accepted",
            or_(Friendship.user_a == viewer_id, Friendship.user_b == viewer_id),
        )
    )
    friend_ids: list[UUID] = []
    for f in pairs:
        friend_ids.append(f.user_b if f.user_a == viewer_id else f.user_a)
    if not friend_ids:
        return []
    rows = await session.execute(
        select(Response, Profile, ResponseVisibility)
        .join(Profile, Profile.user_id == Response.user_id)
        .outerjoin(
            ResponseVisibility,
            and_(
                ResponseVisibility.user_id == Response.user_id,
                ResponseVisibility.moment_id == moment_id,
            ),
        )
        .where(Response.moment_id == moment_id, Response.user_id.in_(friend_ids))
    )
    out = []
    for response, profile, vis_row in rows:
        default_vis = profile.default_visibility
        vis = vis_row.visibility if vis_row else default_vis
        if vis == "private":
            continue
        if vis == "friends" or vis == "public":
            out.append(
                {
                    "userId": str(profile.user_id),
                    "displayName": profile.display_name,
                    "avatarKey": profile.avatar_key,
                    "optionId": str(response.option_id),
                }
            )
    return out[:8]
