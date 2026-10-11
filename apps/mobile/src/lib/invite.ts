const INVITE_MESSAGE = "Come play with me on MAJA — every swipe is a game.";

/** Builds the text sent when inviting a friend to the app. */
export function inviteMessage(opts: { playerId?: string | null; link?: string | null } = {}): string {
  const lines = [INVITE_MESSAGE];
  const link = opts.link?.trim();
  if (link) lines.push(link);
  if (opts.playerId) lines.push(`My player ID: ${opts.playerId}`);
  return lines.join("\n");
}
