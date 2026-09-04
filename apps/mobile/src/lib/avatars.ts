import { getApiBaseUrl } from "./env";

export function avatarPublicUrl(avatarKey: string | null | undefined): string | null {
  if (!avatarKey?.trim()) return null;

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (supabaseUrl) {
    const segments = avatarKey.split("/").map((part) => encodeURIComponent(part));
    return `${supabaseUrl}/storage/v1/object/public/avatars/${segments.join("/")}`;
  }

  const safeKey = avatarKey.replace(/\//g, "_");
  return `${getApiBaseUrl()}/static/avatars/${encodeURIComponent(safeKey)}`;
}

export function initialsFor(name: string | null | undefined): string {
  const trimmed = (name ?? "P").trim();
  if (!trimmed) return "P";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}
