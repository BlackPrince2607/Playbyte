import { Platform, Share } from "react-native";
import * as Sharing from "expo-sharing";

/**
 * Opens the system share sheet with caption text (must already include the app
 * download link) and, when possible, the local image card.
 *
 * Prefer react-native-share so Android gets EXTRA_TEXT + EXTRA_STREAM together.
 * Fall back to RN Share (iOS can attach url + message) or text-only — never
 * share an image alone, which drops the download link.
 */
export async function shareImageWithMessage(opts: {
  uri: string;
  message: string;
  mimeType?: string;
}): Promise<void> {
  const message = opts.message.trim();
  const mimeType = opts.mimeType ?? "image/png";
  if (!message) {
    throw new Error("Share message is required.");
  }

  try {
    const RNShare = (await import("react-native-share")).default;
    await RNShare.open({
      message,
      url: opts.uri,
      type: mimeType,
      failOnCancel: false,
      ...(Platform.OS === "android" ? { useInternalStorage: true } : {}),
    });
    return;
  } catch (e) {
    if (isShareSheetCancelled(e)) return;
    // Native module missing (Expo Go) or open failed — try built-in APIs next.
  }

  if (Platform.OS === "ios") {
    await Share.share({ message, url: opts.uri });
    return;
  }

  // Android built-in Share is text-only; never use expo-sharing alone (image-only).
  await Share.share({ message });
}

/** Text-only share that still requires a non-empty message (caller adds the link). */
export async function shareTextMessage(message: string): Promise<void> {
  const body = message.trim();
  if (!body) throw new Error("Share message is required.");
  await Share.share({ message: body });
}

/** True when file sharing is available (image path may still fall back to text). */
export async function canShareFiles(): Promise<boolean> {
  return Sharing.isAvailableAsync();
}

function isShareSheetCancelled(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: string; error?: { code?: string }; code?: string };
  const code = String(e.code ?? e.error?.code ?? "").toUpperCase();
  if (code.includes("CANCEL") || code.includes("DISMISS")) return true;
  const m = String(e.message ?? "").toLowerCase();
  return m.includes("cancel") || m.includes("dismiss") || m.includes("user did not share");
}
