from __future__ import annotations

import re
from dataclasses import dataclass

ALLOWED_CONTENT_TYPES: dict[str, set[str]] = {
    "share-cards": {"image/png"},
    "avatars": {"image/png", "image/jpeg", "image/webp"},
    "exports": {"application/json"},
}

MAX_BYTES: dict[str, int] = {
    "share-cards": 2 * 1024 * 1024,
    "avatars": 2 * 1024 * 1024,
    "exports": 10 * 1024 * 1024,
}

_KEY_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9/_\-.]{0,512}$")


@dataclass(frozen=True)
class StorageValidationError(ValueError):
    message: str

    def __str__(self) -> str:
        return self.message


def validate_upload(*, bucket: str, key: str, content_type: str, size: int) -> None:
    if bucket not in ALLOWED_CONTENT_TYPES:
        raise StorageValidationError(f"Bucket not allowed: {bucket}")
    if not _KEY_RE.match(key):
        raise StorageValidationError("Invalid object key.")
    if ".." in key or key.startswith("/"):
        raise StorageValidationError("Invalid object key path.")
    allowed = ALLOWED_CONTENT_TYPES[bucket]
    if content_type not in allowed:
        raise StorageValidationError(f"Content type not allowed for {bucket}: {content_type}")
    limit = MAX_BYTES[bucket]
    if size <= 0 or size > limit:
        raise StorageValidationError(f"Object exceeds size limit ({limit} bytes).")
