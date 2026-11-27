import { withAppDownloadLink } from "./shareMessage";

const INVITE_MESSAGE = "Come play with me on MAJA — every swipe is a game.";

/**
 * Builds the text sent when inviting a friend. A personal invite link opens MAJA and adds the
 * sender as a friend, so it replaces the plain download link when there is one.
 * Always ends with a link when one is provided.
 */
export function inviteMessage(
  opts: { link?: string | null; friendLink?: string | null; friendCode?: string | null } = {},
): string {
  const lines = [INVITE_MESSAGE];
  const link = opts.friendLink?.trim() || opts.link?.trim();
  if (link) lines.push(link);
  if (opts.friendCode) lines.push(`My friend code: ${opts.friendCode}`);
  // Idempotent — keeps the link even if a future edit drops the push above.
  return link ? withAppDownloadLink(lines.join("\n"), link) : lines.join("\n");
}
