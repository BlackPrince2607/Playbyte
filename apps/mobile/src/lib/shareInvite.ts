import { Share } from "react-native";
import { capture } from "./analytics";
import { formatFriendCode, friendCodeFor, inviteLink } from "./friendCode";
import { inviteMessage } from "./invite";
import { APP_SHARE_URL } from "./links";

/** The link that opens MAJA and adds this player as a friend; null without a server address. */
export function myInviteLink(playerId: string): string | null {
  return inviteLink(friendCodeFor(playerId), process.env.EXPO_PUBLIC_API_URL);
}

/**
 * Opens the native share sheet with an app invite. With a player ID the message carries a link
 * that adds them as a friend when opened. Cancelling is not an error.
 */
export async function shareAppInvite(
  playerId?: string | null,
  buttonLocation: string = "unknown",
): Promise<void> {
  capture("share_clicked", {
    button_location: buttonLocation,
    share_medium: "invite",
    user_id: playerId ?? null,
  });
  try {
    await Share.share({
      message: inviteMessage({
        link: APP_SHARE_URL,
        friendLink: playerId ? myInviteLink(playerId) : null,
        friendCode: playerId ? formatFriendCode(friendCodeFor(playerId)) : null,
      }),
    });
  } catch {
    /* cancelled */
  }
}
