export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() || "support@maja.app";

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
