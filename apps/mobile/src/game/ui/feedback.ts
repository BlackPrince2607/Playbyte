import * as Haptics from "expo-haptics";
import { AccessibilityInfo, Platform } from "react-native";
import type { SfxKey } from "../../audio/catalog";
import { playSfx } from "../../audio/sound";

export type FeedbackKind = "tap" | "select" | "success" | "error" | "warning" | "levelUp" | "complete";

let hapticsEnabled = true;
let reduceMotion = false;

AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => {
    reduceMotion = v;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => {
  reduceMotion = v;
});

export function setHapticsEnabled(enabled: boolean) {
  hapticsEnabled = enabled;
}

export function prefersReducedMotion() {
  return reduceMotion;
}

const android: Record<FeedbackKind, Haptics.AndroidHaptics> = {
  tap: Haptics.AndroidHaptics.Virtual_Key,
  select: Haptics.AndroidHaptics.Segment_Tick,
  success: Haptics.AndroidHaptics.Confirm,
  error: Haptics.AndroidHaptics.Reject,
  warning: Haptics.AndroidHaptics.Long_Press,
  levelUp: Haptics.AndroidHaptics.Toggle_On,
  complete: Haptics.AndroidHaptics.Confirm,
};

const sounds: Partial<Record<FeedbackKind, SfxKey>> = {
  success: "correct",
  error: "wrong",
  warning: "wrong",
  levelUp: "levelUp",
  complete: "complete",
};

/** Single haptics and sound-effect entry point for every engine; haptic failures are swallowed (unsupported devices). */
export function feedback(kind: FeedbackKind) {
  const sound = sounds[kind];
  if (sound) playSfx(sound);
  if (!hapticsEnabled) return;
  const run = (): Promise<void> => {
    if (Platform.OS === "android") return Haptics.performAndroidHapticsAsync(android[kind]);
    switch (kind) {
      case "tap":
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      case "select":
        return Haptics.selectionAsync();
      case "success":
      case "complete":
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      case "error":
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      case "warning":
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      case "levelUp":
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  };
  run().catch(() => {});
}
