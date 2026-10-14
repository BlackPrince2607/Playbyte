"""Short friend codes derived from player IDs.

A code is the first 40 bits of the user's UUID in Crockford base32 (8 characters, shown as
XXXX-XXXX). It needs no storage, and because Postgres orders UUIDs byte by byte, finding the
owner is a range scan on the users primary key.
"""

import re
from uuid import UUID

ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
CODE_LEN = 8
_BITS = CODE_LEN * 5
_HEX = _BITS // 4
_LOOKALIKES = str.maketrans({"O": "0", "I": "1", "L": "1"})
_LINK = re.compile(r"/add/([0-9A-Za-z-]{8,9})(?:[/?#]|$)")


def friend_code(user_id: UUID) -> str:
    value = int(user_id.hex[:_HEX], 16)
    chars = []
    for _ in range(CODE_LEN):
        chars.append(ALPHABET[value & 31])
        value >>= 5
    return "".join(reversed(chars))


def format_code(code: str) -> str:
    return f"{code[:4]}-{code[4:]}"


def parse_code(text: str) -> str | None:
    """Accepts a bare code (any case, with or without the dash) or an invite link containing one."""
    raw = (text or "").strip()
    link = _LINK.search(raw)
    if link:
        raw = link.group(1)
    code = re.sub(r"[\s-]", "", raw).upper().translate(_LOOKALIKES)
    if len(code) != CODE_LEN or any(c not in ALPHABET for c in code):
        return None
    return code


def code_range(code: str) -> tuple[UUID, UUID]:
    """Lowest and highest UUID whose first 40 bits match the code."""
    value = 0
    for c in code:
        value = value * 32 + ALPHABET.index(c)
    prefix = f"{value:0{_HEX}x}"
    return UUID(prefix + "0" * (32 - _HEX)), UUID(prefix + "f" * (32 - _HEX))
