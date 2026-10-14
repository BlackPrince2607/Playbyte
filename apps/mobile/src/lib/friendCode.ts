/**
 * Short friend codes, matching backend/app/modules/friends/codes.py: the first 40 bits of the
 * player's UUID in Crockford base32, shown as XXXX-XXXX.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LEN = 8;
const LOOKALIKES: Record<string, string> = { O: "0", I: "1", L: "1" };
const LINK = /\/add\/([0-9A-Za-z-]{8,9})(?:[/?#]|$)/;
const PLAYER_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function friendCodeFor(userId: string): string {
  let value = parseInt(userId.replace(/-/g, "").slice(0, 10), 16);
  let code = "";
  for (let i = 0; i < CODE_LEN; i++) {
    code = ALPHABET[value % 32] + code;
    value = Math.floor(value / 32);
  }
  return code;
}

export function formatFriendCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Reads a typed code, an invite link, or an old full player ID out of pasted text. */
export function parseFriendCode(text: string): string | null {
  const raw = (text ?? "").trim();
  const link = LINK.exec(raw);
  if (link) return normalise(link[1]);
  const playerId = PLAYER_ID.exec(raw);
  if (playerId) return friendCodeFor(playerId[0]);
  return normalise(raw);
}

/** The friend code in an opened link such as https://…/add/XXXX-XXXX or maja://add/XXXX-XXXX. */
export function codeFromUrl(url: string | null | undefined): string | null {
  const link = url ? LINK.exec(url) : null;
  return link ? normalise(link[1]) : null;
}

export function inviteLink(code: string, baseUrl: string | null | undefined): string | null {
  const base = baseUrl?.trim().replace(/\/+$/, "");
  return base ? `${base}/add/${formatFriendCode(code)}` : null;
}

function normalise(raw: string): string | null {
  const code = raw
    .replace(/[\s-]/g, "")
    .toUpperCase()
    .replace(/[OIL]/g, (c) => LOOKALIKES[c]);
  return code.length === CODE_LEN && [...code].every((c) => ALPHABET.includes(c)) ? code : null;
}
