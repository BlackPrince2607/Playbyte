from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM, JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _pg_enum(*values: str, name: str) -> ENUM:
    """Use existing Postgres ENUM types from migrations (do not CREATE TYPE)."""
    return ENUM(*values, name=name, create_type=False)


user_status = _pg_enum("active", "disabled", "deleted", name="user_status")
actor_visibility = _pg_enum("public", "friends", "private", name="actor_visibility")
moment_type = _pg_enum("predict", "pulse", "reaction", name="moment_type")
moment_status = _pg_enum(
    "draft", "scheduled", "ready", "live", "closed", "retired", name="moment_status"
)
restricted_topic = _pg_enum("none", "health", "tragedy", "election", name="restricted_topic")
friendship_status = _pg_enum("pending", "accepted", "blocked", name="friendship_status")
game_status = _pg_enum("enabled", "disabled", name="game_status")
window_status = _pg_enum("draft", "active", "ended", name="window_status")
outbox_status = _pg_enum("pending", "processing", "done", "dead", name="outbox_status")
report_status = _pg_enum("open", "reviewed", "actioned", "dismissed", name="report_status")
data_request_type = _pg_enum("export", "deletion", name="data_request_type")
data_request_status = _pg_enum(
    "queued", "processing", "complete", "failed", name="data_request_status"
)
approval_decision = _pg_enum("approve", "reject", name="approval_decision")
volume_state = _pg_enum("nascent", "building", "mature", name="volume_state")


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    auth_subject: Mapped[str | None] = mapped_column(Text, unique=True)
    status: Mapped[str] = mapped_column(user_status, default="active")
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    age_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    profile: Mapped["Profile"] = relationship(back_populates="user", uselist=False)


class GuestSession(Base):
    __tablename__ = "guest_sessions"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    moments_responded_count: Mapped[int] = mapped_column(Integer, default=0)
    games_played_count: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    converted_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Profile(Base):
    __tablename__ = "profiles"

    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    display_name: Mapped[str] = mapped_column(Text, default="Player")
    avatar_key: Mapped[str | None] = mapped_column(Text)
    bio: Mapped[str | None] = mapped_column(Text)
    default_visibility: Mapped[str] = mapped_column(actor_visibility, default="friends")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="profile")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    slug: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class UserInterest(Base):
    __tablename__ = "user_interests"

    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    category_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("categories.id"), primary_key=True)


class GuestInterest(Base):
    __tablename__ = "guest_interests"

    guest_session_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("guest_sessions.id"), primary_key=True
    )
    category_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("categories.id"), primary_key=True)


class ContentWindow(Base):
    __tablename__ = "content_windows"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    slug: Mapped[str] = mapped_column(Text, unique=True)
    title: Mapped[str] = mapped_column(Text)
    category_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("categories.id"))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    priority: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(window_status, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Moment(Base):
    __tablename__ = "moments"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    type: Mapped[str] = mapped_column(moment_type)
    category_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("categories.id"))
    content_window_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("content_windows.id"))
    status: Mapped[str] = mapped_column(moment_status, default="draft")
    restricted_topic: Mapped[str] = mapped_column(restricted_topic, default="none")
    prompt: Mapped[str] = mapped_column(Text)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    options: Mapped[list["MomentOption"]] = relationship(back_populates="moment")
    category: Mapped[Category] = relationship()


class MomentOption(Base):
    __tablename__ = "moment_options"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    moment_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("moments.id"))
    label: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer)
    moment: Mapped[Moment] = relationship(back_populates="options")


class Response(Base):
    __tablename__ = "responses"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    moment_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("moments.id"))
    option_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("moment_options.id"))
    user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    guest_session_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("guest_sessions.id"))
    idempotency_key: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CrowdSnapshot(Base):
    __tablename__ = "crowd_snapshots"

    moment_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("moments.id"), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, default=0)
    total_responses: Mapped[int] = mapped_column(Integer, default=0)
    option_counts: Mapped[dict] = mapped_column(JSONB, default=dict)
    joined_last_minute: Mapped[int] = mapped_column(Integer, default=0)
    volume_state: Mapped[str] = mapped_column(volume_state, default="nascent")
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Friendship(Base):
    __tablename__ = "friendships"
    __table_args__ = (UniqueConstraint("user_a", "user_b"), CheckConstraint("user_a < user_b"))

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_a: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    user_b: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(friendship_status, default="pending")
    requested_by: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ResponseVisibility(Base):
    __tablename__ = "response_visibility"

    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    moment_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("moments.id"), primary_key=True)
    visibility: Mapped[str] = mapped_column(actor_visibility)


class MomentApproval(Base):
    __tablename__ = "moment_approvals"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    moment_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("moments.id"))
    approver_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    decision: Mapped[str] = mapped_column(approval_decision)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MiniGame(Base):
    __tablename__ = "mini_games"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    blurb: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(game_status, default="enabled")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)


class GamePlay(Base):
    __tablename__ = "game_plays"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    game_key: Mapped[str] = mapped_column(Text, ForeignKey("mini_games.key"))
    user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    guest_session_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("guest_sessions.id"))
    score: Mapped[int] = mapped_column(Integer)
    duration_ms: Mapped[int] = mapped_column(Integer)
    idempotency_key: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ShareCard(Base):
    __tablename__ = "share_cards"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    moment_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("moments.id"))
    game_key: Mapped[str | None] = mapped_column(Text, ForeignKey("mini_games.key"))
    user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    guest_session_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("guest_sessions.id"))
    asset_key: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    reporter_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    reporter_guest_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("guest_sessions.id"))
    target_type: Mapped[str] = mapped_column(Text)
    target_id: Mapped[str] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(report_status, default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OutboxEvent(Base):
    __tablename__ = "outbox_events"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    type: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(outbox_status, default="pending")
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PushToken(Base):
    __tablename__ = "push_tokens"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    platform: Mapped[str] = mapped_column(Text)
    token: Mapped[str] = mapped_column(Text, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    live_now: Mapped[bool] = mapped_column(Boolean, default=True)
    trending: Mapped[bool] = mapped_column(Boolean, default=True)
    friend_activity: Mapped[bool] = mapped_column(Boolean, default=True)


class NotificationDelivery(Base):
    __tablename__ = "notification_deliveries"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    event_key: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class UserDailyStat(Base):
    __tablename__ = "user_daily_stats"

    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    moments_joined: Mapped[int] = mapped_column(Integer, default=0)
    games_played: Mapped[int] = mapped_column(Integer, default=0)
    majority_matches: Mapped[int] = mapped_column(Integer, default=0)
    unique_people: Mapped[int] = mapped_column(Integer, default=0)


class DataRequest(Base):
    __tablename__ = "data_requests"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    type: Mapped[str] = mapped_column(data_request_type)
    status: Mapped[str] = mapped_column(data_request_status, default="queued")
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    download_key: Mapped[str | None] = mapped_column(Text)


class Consent(Base):
    __tablename__ = "consents"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(Text)
    granted: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AdminUser(Base):
    __tablename__ = "admin_users"

    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    role: Mapped[str] = mapped_column(Text, default="editor")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    actor_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    action: Mapped[str] = mapped_column(Text)
    resource: Mapped[str] = mapped_column(Text)
    resource_id: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ModerationAction(Base):
    __tablename__ = "moderation_actions"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    actor_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    target_type: Mapped[str] = mapped_column(Text)
    target_id: Mapped[str] = mapped_column(Text)
    action: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
