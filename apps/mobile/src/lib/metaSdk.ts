import { requestTrackingPermissionsAsync } from "expo-tracking-transparency";
import { Platform } from "react-native";
import { Settings } from "react-native-fbsdk-next";

/**
 * Starts the Meta SDK so installs and app events are attributed to Meta ad campaigns.
 * On iOS the advertiser-tracking flag must mirror the App Tracking Transparency answer.
 */
export async function initMetaSdk(): Promise<void> {
  if (Platform.OS === "web" || !process.env.EXPO_PUBLIC_FACEBOOK_APP_ID) return;
  try {
    Settings.initializeSDK();
    if (Platform.OS === "ios") {
      const { granted } = await requestTrackingPermissionsAsync();
      await Settings.setAdvertiserTrackingEnabled(granted);
    }
  } catch {
    /* native module missing (Expo Go or a build without the plugin) */
  }
}
