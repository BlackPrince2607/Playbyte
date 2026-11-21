import AsyncStorage from "@react-native-async-storage/async-storage";
import { localDateString } from "./dailyStreak";

const KEYS = {
  installDay: "maja_install_day",
  sessionNumber: "maja_session_number",
  gamesCompleted: "maja_games_completed",
  activated: "maja_user_activated",
  streakRitualShown: "maja_streak_ritual_shown",
  streakReminderEnabled: "maja_streak_reminder_enabled",
  streakReminderAsked: "maja_streak_reminder_asked",
  day0AppointmentShown: "maja_day0_appointment_shown",
  friendChallengePrompt: "maja_friend_challenge_prompt",
  streakReturnToastDay: "maja_streak_return_toast_day",
  lastStreakCount: "maja_analytics_last_streak",
} as const;

export async function ensureInstallDay(now = new Date()): Promise<string> {
  const existing = await AsyncStorage.getItem(KEYS.installDay);
  if (existing) return existing;
  const day = localDateString(now);
  await AsyncStorage.setItem(KEYS.installDay, day);
  return day;
}

export async function getInstallDay(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.installDay);
}

/** Calendar days since first open (0 on install day). */
export function daysSinceInstall(installDay: string, now = new Date()): number {
  const today = localDateString(now);
  if (installDay === today) return 0;
  const [iy, im, id] = installDay.split("-").map(Number);
  const start = new Date(iy, (im || 1) - 1, id || 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

export async function bumpSessionNumber(): Promise<number> {
  const raw = await AsyncStorage.getItem(KEYS.sessionNumber);
  const next = (raw ? Number(raw) : 0) + 1;
  await AsyncStorage.setItem(KEYS.sessionNumber, String(next));
  return next;
}

export async function getSessionNumber(): Promise<number> {
  const raw = await AsyncStorage.getItem(KEYS.sessionNumber);
  return raw ? Number(raw) : 0;
}

export async function getGamesCompletedLifetime(): Promise<number> {
  const raw = await AsyncStorage.getItem(KEYS.gamesCompleted);
  return raw ? Number(raw) : 0;
}

export async function incrementGamesCompleted(): Promise<{ count: number; isFirstPlay: boolean }> {
  const prev = await getGamesCompletedLifetime();
  const count = prev + 1;
  await AsyncStorage.setItem(KEYS.gamesCompleted, String(count));
  return { count, isFirstPlay: prev === 0 };
}

export async function isUserActivated(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.activated)) === "1";
}

export async function markUserActivated(): Promise<boolean> {
  if (await isUserActivated()) return false;
  await AsyncStorage.setItem(KEYS.activated, "1");
  return true;
}

export async function shouldShowStreakRitual(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.streakRitualShown)) !== "1";
}

export async function markStreakRitualShown(): Promise<void> {
  await AsyncStorage.setItem(KEYS.streakRitualShown, "1");
}

export async function isStreakReminderEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEYS.streakReminderEnabled);
  // Default on once the user has opted in via permission; unset = not enabled yet.
  return v === "1";
}

export async function setStreakReminderEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.streakReminderEnabled, enabled ? "1" : "0");
}

export async function hasAskedStreakReminder(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.streakReminderAsked)) === "1";
}

export async function markStreakReminderAsked(): Promise<void> {
  await AsyncStorage.setItem(KEYS.streakReminderAsked, "1");
}

export async function shouldShowDay0Appointment(playsTodayHint: number): Promise<boolean> {
  if (playsTodayHint < 2) return false;
  const install = await ensureInstallDay();
  if (install !== localDateString()) return false;
  return (await AsyncStorage.getItem(KEYS.day0AppointmentShown)) !== "1";
}

export async function markDay0AppointmentShown(): Promise<void> {
  await AsyncStorage.setItem(KEYS.day0AppointmentShown, "1");
}

export async function shouldShowFriendChallengePrompt(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.friendChallengePrompt)) !== "shown";
}

export async function markFriendChallengePromptShown(): Promise<void> {
  await AsyncStorage.setItem(KEYS.friendChallengePrompt, "shown");
}

/** Show a one-shot “streak saved” toast when returning on a new day with streak ≥ 2. */
export async function consumeStreakReturnToast(streak: number): Promise<boolean> {
  if (streak < 2) return false;
  const today = localDateString();
  const last = await AsyncStorage.getItem(KEYS.streakReturnToastDay);
  if (last === today) return false;
  await AsyncStorage.setItem(KEYS.streakReturnToastDay, today);
  return true;
}

export async function noteStreakForAnalytics(streak: number): Promise<{ broken: boolean; previous: number }> {
  const raw = await AsyncStorage.getItem(KEYS.lastStreakCount);
  const previous = raw ? Number(raw) : 0;
  // Broken when we had a multi-day streak and landed back at 1.
  const broken = previous > 1 && streak === 1;
  await AsyncStorage.setItem(KEYS.lastStreakCount, String(streak));
  return { broken, previous };
}
