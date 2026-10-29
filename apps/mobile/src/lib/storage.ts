import AsyncStorage from "@react-native-async-storage/async-storage";
import { localDateString, nextDailyStreak } from "./dailyStreak";

const KEYS = {
  guestToken: "maja_guest_token",
  legacyToken: "maja_token",
  onboarding: "maja_onboarding_done",
  onboardingStep: "maja_onboarding_step",
  language: "maja_language",
  streak: "maja_streak",
  streakDate: "maja_streak_date",
  localProfile: "maja_local_profile",
  sound: "maja_sound",
  swipeHint: "maja_swipe_hint",
} as const;

export type OnboardingStep = "language" | "intro" | "signup" | "profile" | "interests" | "ready";

const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  "language",
  "intro",
  "signup",
  "profile",
  "interests",
  "ready",
];

export type Gender = "male" | "female" | "other";

export type LocalProfile = { name: string; email: string; gender: Gender | null };

function isOnboardingStep(v: string | null): v is OnboardingStep {
  return v != null && (ONBOARDING_STEPS as readonly string[]).includes(v);
}

export async function getStoredGuestToken() {
  const current = await AsyncStorage.getItem(KEYS.guestToken);
  if (current) return current;
  const legacy = await AsyncStorage.getItem(KEYS.legacyToken);
  if (legacy) {
    await AsyncStorage.setItem(KEYS.guestToken, legacy);
    return legacy;
  }
  return null;
}

export async function setStoredGuestToken(token: string) {
  if (!token) {
    await AsyncStorage.multiRemove([KEYS.guestToken, KEYS.legacyToken]);
    return;
  }
  await AsyncStorage.setItem(KEYS.guestToken, token);
}

/** @deprecated use getStoredGuestToken */
export async function getStoredToken() {
  return getStoredGuestToken();
}

/** @deprecated use setStoredGuestToken */
export async function setStoredToken(token: string) {
  await setStoredGuestToken(token);
}

export async function isOnboardingDone() {
  return (await AsyncStorage.getItem(KEYS.onboarding)) === "1";
}

export async function getOnboardingStep(): Promise<OnboardingStep> {
  const v = await AsyncStorage.getItem(KEYS.onboardingStep);
  return isOnboardingStep(v) ? v : "language";
}

export async function setOnboardingStep(step: OnboardingStep) {
  await AsyncStorage.setItem(KEYS.onboardingStep, step);
}

export async function clearOnboardingStep() {
  await AsyncStorage.removeItem(KEYS.onboardingStep);
}

export async function setOnboardingDone() {
  await AsyncStorage.multiSet([
    [KEYS.onboarding, "1"],
    [KEYS.swipeHint, "pending"],
  ]);
  await clearOnboardingStep();
}

/** Re-open onboarding mid-app (e.g. guest skipped profile/interests, then signed in). */
export async function clearOnboardingDone() {
  await AsyncStorage.removeItem(KEYS.onboarding);
}

/** True only for players who just finished onboarding and haven't swiped the feed yet. */
export async function isSwipeHintPending() {
  return (await AsyncStorage.getItem(KEYS.swipeHint)) === "pending";
}

export async function markSwipeHintSeen() {
  await AsyncStorage.setItem(KEYS.swipeHint, "seen");
}

export async function getLanguage() {
  return (await AsyncStorage.getItem(KEYS.language)) ?? "en";
}

export async function setLanguage(lang: string) {
  await AsyncStorage.setItem(KEYS.language, lang);
}

/** Name, email and gender from onboarding. Gender (and everything, for guests) only lives on this device. */
export async function getLocalProfile(): Promise<LocalProfile | null> {
  const raw = await AsyncStorage.getItem(KEYS.localProfile);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<LocalProfile>;
    return {
      name: typeof p.name === "string" ? p.name : "",
      email: typeof p.email === "string" ? p.email : "",
      gender: p.gender === "male" || p.gender === "female" || p.gender === "other" ? p.gender : null,
    };
  } catch {
    return null;
  }
}

export async function setLocalProfile(profile: LocalProfile) {
  await AsyncStorage.setItem(KEYS.localProfile, JSON.stringify(profile));
}

export type SoundPrefs = { music: boolean; sfx: boolean };

export async function getSoundPrefs(): Promise<SoundPrefs> {
  try {
    const p = JSON.parse((await AsyncStorage.getItem(KEYS.sound)) ?? "{}") as Partial<SoundPrefs>;
    return { music: p.music !== false, sfx: p.sfx !== false };
  } catch {
    return { music: true, sfx: true };
  }
}

export async function setSoundPrefs(prefs: SoundPrefs) {
  await AsyncStorage.setItem(KEYS.sound, JSON.stringify(prefs));
}

export async function getStreak() {
  const v = await AsyncStorage.getItem(KEYS.streak);
  return v ? Number(v) : 0;
}

export async function getStreakDate() {
  return AsyncStorage.getItem(KEYS.streakDate);
}

const FREE_HINTS_KEY = "maja_free_hints";

export async function guestFreeHintsLeft(now = new Date()): Promise<number> {
  const today = localDateString(now);
  const raw = await AsyncStorage.getItem(FREE_HINTS_KEY);
  let used = 0;
  try {
    const parsed = raw ? (JSON.parse(raw) as { date?: string; used?: number }) : null;
    if (parsed?.date === today) used = Number(parsed.used) || 0;
  } catch {
    used = 0;
  }
  return Math.max(0, 3 - used);
}

/** Uses one of the three daily guest hints. False when today's allowance is gone. */
export async function takeGuestFreeHint(now = new Date()): Promise<boolean> {
  const today = localDateString(now);
  const left = await guestFreeHintsLeft(now);
  if (left <= 0) return false;
  const raw = await AsyncStorage.getItem(FREE_HINTS_KEY);
  let used = 0;
  try {
    const parsed = raw ? (JSON.parse(raw) as { date?: string; used?: number }) : null;
    if (parsed?.date === today) used = Number(parsed.used) || 0;
  } catch {
    used = 0;
  }
  await AsyncStorage.setItem(FREE_HINTS_KEY, JSON.stringify({ date: today, used: used + 1 }));
  return true;
}

export async function recordDailyVisit(now = new Date()): Promise<number> {
  const today = localDateString(now);
  const storedDate = await AsyncStorage.getItem(KEYS.streakDate);
  const current = await getStreak();
  const next = nextDailyStreak(current, storedDate, today);
  if (storedDate === today && next === current) return current;
  await AsyncStorage.multiSet([
    [KEYS.streak, String(next)],
    [KEYS.streakDate, today],
  ]);
  return next;
}
