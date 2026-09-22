import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  guestToken: "playbyte_guest_token",
  legacyToken: "playbyte_token",
  onboarding: "playbyte_onboarding_done",
  onboardingStep: "playbyte_onboarding_step",
  language: "playbyte_language",
  streak: "playbyte_streak",
} as const;

export type OnboardingStep = "welcome" | "get_started" | "language" | "interests";

const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  "welcome",
  "get_started",
  "language",
  "interests",
];

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
  return isOnboardingStep(v) ? v : "welcome";
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

export async function getStreak() {
  const v = await AsyncStorage.getItem(KEYS.streak);
  return v ? Number(v) : 0;
}

export async function bumpStreak() {
  const next = (await getStreak()) + 1;
  await AsyncStorage.setItem(KEYS.streak, String(next));
  return next;
}
