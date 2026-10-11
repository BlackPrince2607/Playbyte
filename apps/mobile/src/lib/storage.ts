import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  guestToken: "maja_guest_token",
  legacyToken: "maja_token",
  onboarding: "maja_onboarding_done",
  onboardingStep: "maja_onboarding_step",
  language: "maja_language",
  streak: "maja_streak",
  localProfile: "maja_local_profile",
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
  await AsyncStorage.setItem(KEYS.onboarding, "1");
  await clearOnboardingStep();
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

export async function getStreak() {
  const v = await AsyncStorage.getItem(KEYS.streak);
  return v ? Number(v) : 0;
}

export async function bumpStreak() {
  const next = (await getStreak()) + 1;
  await AsyncStorage.setItem(KEYS.streak, String(next));
  return next;
}
