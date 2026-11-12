import { requestTrackingPermissionsAsync } from "expo-tracking-transparency";
import { Platform } from "react-native";

type Fbsdk = typeof import("react-native-fbsdk-next");
type MetaProps = Record<string, string | number | boolean | null | undefined>;

const APP_ID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID?.trim() ?? "";
const CLIENT_TOKEN = process.env.EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN?.trim() ?? "";

let ready = false;
const pending: { event: string; props?: MetaProps }[] = [];

function loadSdk(): Fbsdk | null {
  if (Platform.OS === "web" || !APP_ID) return null;
  try {
    // Lazy require: touching FBAccessToken aborts launches built without a Facebook app ID.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-fbsdk-next") as Fbsdk;
  } catch {
    return null;
  }
}

/** Meta AppEventsLogger only accepts string | number parameter values. */
function toMetaParams(props?: MetaProps): Record<string, string | number> | undefined {
  if (!props) return undefined;
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "boolean") out[key] = value ? 1 : 0;
    else out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function emit(sdk: Fbsdk, event: string, props?: MetaProps): void {
  const params = toMetaParams(props);
  if (params) sdk.AppEventsLogger.logEvent(event, params);
  else sdk.AppEventsLogger.logEvent(event);
}

/**
 * Starts the Meta SDK so installs and app events are attributed to Meta ad campaigns.
 * On iOS the advertiser-tracking flag must mirror the App Tracking Transparency answer.
 */
export async function initMetaSdk(): Promise<void> {
  const sdk = loadSdk();
  if (!sdk) return;
  try {
    const { Settings, AppEventsLogger } = sdk;
    Settings.setAppID(APP_ID);
    if (CLIENT_TOKEN) Settings.setClientToken(CLIENT_TOKEN);
    Settings.setAutoLogAppEventsEnabled(true);
    Settings.setAdvertiserIDCollectionEnabled(true);
    Settings.initializeSDK();
    if (Platform.OS === "ios") {
      const { granted } = await requestTrackingPermissionsAsync();
      await Settings.setAdvertiserTrackingEnabled(granted);
    }
    AppEventsLogger.setFlushBehavior("auto");
    // Explicit activate so Events Manager shows activity even when auto-log is delayed.
    AppEventsLogger.logEvent("fb_mobile_activate_app");
    ready = true;
    while (pending.length) {
      const next = pending.shift();
      if (next) emit(sdk, next.event, next.props);
    }
    AppEventsLogger.flush();
  } catch {
    ready = false;
  }
}

/** Log a custom / product event to Meta. Queues until initMetaSdk succeeds. */
export function logMetaEvent(event: string, props?: MetaProps): void {
  if (!APP_ID) return;
  if (!ready) {
    pending.push({ event, props });
    return;
  }
  const sdk = loadSdk();
  if (!sdk) return;
  try {
    emit(sdk, event, props);
  } catch {
    /* native module missing or rejected the payload */
  }
}
