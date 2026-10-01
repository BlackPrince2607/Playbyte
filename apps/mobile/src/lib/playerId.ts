const PLAYER_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Finds a player ID inside pasted text such as an invite message. */
export function extractPlayerId(text: string): string | null {
  const match = PLAYER_ID.exec(text);
  return match ? match[0].toLowerCase() : null;
}

export function shortPlayerId(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

export function playerIdShareMessage(id: string): string {
  return `Add me on PLAY! My player ID: ${id}`;
}
