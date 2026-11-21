import { Platform } from "react-native";
import { capture } from "./analytics";
import {
  hasAskedStreakReminder,
  isStreakReminderEnabled,
  markStreakReminderAsked,
  setStreakReminderEnabled,
} from "./retentionStorage";

const STREAK_REMINDER_ID = "maja-streak-daily";
/** Local wall-clock hour for the daily streak nudge (evening habit window). */
const REMINDER_HOUR = 19;
const REMINDER_MINUTE = 30;

type NotificationsModule = typeof import("expo-notifications");

let notifications: NotificationsModule | null | undefined;

function getNotifications(): NotificationsModule | null {
  if (notifications !== undefined) return notifications;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    notifications = require("expo-notifications") as NotificationsModule;
  } catch {
    notifications = null;
  }
  return notifications;
}

let handlerConfigured = false;

async function ensureAndroidChannel(Notifications: NotificationsModule): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("streak-reminders", {
    name: "Streak reminders",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
  });
}

function configureHandler(): void {
  const Notifications = getNotifications();
  if (!Notifications || handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export type ReminderPermissionResult = "granted" | "denied" | "undetermined";

export async function getStreakReminderPermission(): Promise<ReminderPermissionResult> {
  const Notifications = getNotifications();
  if (!Notifications) return "denied";
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

export async function requestStreakReminderPermission(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) {
    capture("reminder_permission_denied", { reason: "module_unavailable" });
    return false;
  }
  configureHandler();
  await markStreakReminderAsked();
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  const granted = status === "granted";
  capture(granted ? "reminder_permission_granted" : "reminder_permission_denied", {
    platform: Platform.OS,
  });
  return granted;
}

async function cancelStreakReminder(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(STREAK_REMINDER_ID);
  } catch {
    /* id may not exist */
  }
}

/** Schedule (or refresh) the daily local streak reminder at 19:30 device time. */
export async function scheduleStreakReminder(opts?: {
  title?: string;
  body?: string;
}): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;
  configureHandler();

  const permission = await getStreakReminderPermission();
  if (permission !== "granted") return false;

  await cancelStreakReminder();

  const title = opts?.title ?? "Keep your Maja streak";
  const body = opts?.body ?? "Open Maja before midnight so your streak doesn’t reset.";

  await ensureAndroidChannel(Notifications);
  await Notifications.scheduleNotificationAsync({
    identifier: STREAK_REMINDER_ID,
    content: {
      title,
      body,
      data: { type: "streak_reminder" },
      sound: true,
      ...(Platform.OS === "android" ? { channelId: "streak-reminders" } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: REMINDER_HOUR,
      minute: REMINDER_MINUTE,
    },
  });

  await setStreakReminderEnabled(true);
  capture("reminder_scheduled", {
    hour: REMINDER_HOUR,
    minute: REMINDER_MINUTE,
    channel: "local",
  });
  return true;
}

export async function disableStreakReminder(): Promise<void> {
  await cancelStreakReminder();
  await setStreakReminderEnabled(false);
}

/** Enable reminder: request permission if needed, then schedule. */
export async function enableStreakReminder(copy?: { title?: string; body?: string }): Promise<boolean> {
  const ok = await requestStreakReminderPermission();
  if (!ok) {
    await setStreakReminderEnabled(false);
    return false;
  }
  return scheduleStreakReminder(copy);
}

/**
 * After a successful streak claim / first game — offer reminder once.
 * Returns true if scheduled (or already enabled and refreshed).
 */
export async function ensureStreakReminderAfterEngagement(copy?: {
  title?: string;
  body?: string;
}): Promise<"scheduled" | "already" | "skipped" | "denied"> {
  if (await isStreakReminderEnabled()) {
    await scheduleStreakReminder(copy);
    return "already";
  }
  if (await hasAskedStreakReminder()) return "skipped";
  const ok = await enableStreakReminder(copy);
  return ok ? "scheduled" : "denied";
}

/** Wire cold-start listener so tapping a reminder attributes the open. */
export function startStreakReminderListener(): () => void {
  const Notifications = getNotifications();
  if (!Notifications) return () => {};
  configureHandler();

  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { type?: string } | undefined;
    if (data?.type === "streak_reminder") {
      capture("reminder_opened", { channel: "local" });
    }
  });

  void Notifications.getLastNotificationResponseAsync().then((last) => {
    const data = last?.notification.request.content.data as { type?: string } | undefined;
    if (data?.type === "streak_reminder") {
      capture("reminder_opened", { channel: "local", source: "cold_start" });
    }
  });

  return () => sub.remove();
}
