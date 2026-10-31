import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MeProfile, NotificationPreferences } from "../api";

const PROFILE_KEY = "maja_me_profile_v1";
const PREFS_KEY = "maja_notif_prefs_v1";

type StoredProfile = { userId: string; profile: MeProfile; savedAt: number };
type StoredPrefs = { userId: string; prefs: NotificationPreferences; savedAt: number };

const memoryProfile = new Map<string, MeProfile>();
const memoryPrefs = new Map<string, NotificationPreferences>();

function isProfile(v: unknown): v is MeProfile {
  if (!v || typeof v !== "object") return false;
  const p = v as MeProfile;
  return typeof p.id === "string" && typeof p.displayName === "string";
}

function isPrefs(v: unknown): v is NotificationPreferences {
  if (!v || typeof v !== "object") return false;
  const p = v as NotificationPreferences;
  return (
    typeof p.liveNow === "boolean" &&
    typeof p.trending === "boolean" &&
    typeof p.friendActivity === "boolean"
  );
}

export function peekProfile(userId: string): MeProfile | null {
  return memoryProfile.get(userId) ?? null;
}

export function peekPrefs(userId: string): NotificationPreferences | null {
  return memoryPrefs.get(userId) ?? null;
}

export async function readProfile(userId: string): Promise<MeProfile | null> {
  const hit = memoryProfile.get(userId);
  if (hit) return hit;
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredProfile>;
    if (parsed.userId !== userId || !isProfile(parsed.profile)) return null;
    memoryProfile.set(userId, parsed.profile);
    return parsed.profile;
  } catch {
    return null;
  }
}

export async function writeProfile(userId: string, profile: MeProfile): Promise<void> {
  memoryProfile.set(userId, profile);
  try {
    const payload: StoredProfile = { userId, profile, savedAt: Date.now() };
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export async function readPrefs(userId: string): Promise<NotificationPreferences | null> {
  const hit = memoryPrefs.get(userId);
  if (hit) return hit;
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    if (parsed.userId !== userId || !isPrefs(parsed.prefs)) return null;
    memoryPrefs.set(userId, parsed.prefs);
    return parsed.prefs;
  } catch {
    return null;
  }
}

export async function writePrefs(userId: string, prefs: NotificationPreferences): Promise<void> {
  memoryPrefs.set(userId, prefs);
  try {
    const payload: StoredPrefs = { userId, prefs, savedAt: Date.now() };
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function clearProfileCache(): void {
  memoryProfile.clear();
  memoryPrefs.clear();
  void AsyncStorage.multiRemove([PROFILE_KEY, PREFS_KEY]).catch(() => {});
}
