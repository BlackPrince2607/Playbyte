export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() || "support@maja.app";

/** Android package / Play Store listing id (matches app.json android.package). */
export const ANDROID_PACKAGE = "app.maja.mobile";

export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

/** Link included in invite / score shares. Override with EXPO_PUBLIC_APP_SHARE_URL if needed. */
export const APP_SHARE_URL = process.env.EXPO_PUBLIC_APP_SHARE_URL?.trim() || PLAY_STORE_URL;

export type LegalLinks = { privacy: string; dataDeletion: string } | null;

/** The privacy and data-deletion pages live on the admin site; null hides the links until it's deployed. */
export function legalLinks(base: string | undefined = process.env.EXPO_PUBLIC_LEGAL_BASE_URL): LegalLinks {
  const root = base?.trim().replace(/\/+$/, "");
  if (!root || !/^https?:\/\//.test(root)) return null;
  return { privacy: `${root}/privacy`, dataDeletion: `${root}/data-deletion` };
}

export function supportMailto(subject: string, body = "", email = SUPPORT_EMAIL): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
