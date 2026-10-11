import { Share } from "react-native";
import { inviteMessage } from "./invite";

/** Opens the native share sheet with an app invite. Cancelling is not an error. */
export async function shareAppInvite(playerId?: string | null): Promise<void> {
  try {
    await Share.share({ message: inviteMessage({ playerId, link: process.env.EXPO_PUBLIC_APP_SHARE_URL }) });
  } catch {
    /* cancelled */
  }
}
