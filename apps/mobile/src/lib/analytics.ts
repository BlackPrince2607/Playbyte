type PostHogClient = import("posthog-react-native").default;

/** Product analytics events from the Events tracking sheet. */
export type AnalyticsEvent =
  | "app_opened"
  | "language_selected"
  | "onboarding_completed"
  | "feed_item_viewed"
  | "game_started"
  | "game_completed"
  | "game_abandoned"
  | "hint_viewed"
  | "hint_unlocked"
  | "result_action_clicked"
  | "challenge_shared"
  | "coin_earned"
  | "coin_spent"
  | "poll_voted"
  | "screen_viewed"
  | "share_clicked";

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim() ?? "";
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

/** Stable for this JS process; used as session_id on app_opened. */
export const analyticsSessionId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

let client: PostHogClient | null = null;
let onboardingStartedAt: number | null = null;
let lastScreen: string | null = null;
let appOpenedOnce = false;

export function analyticsConfigured(): boolean {
  return Boolean(API_KEY);
}

/** Shared client for PostHogProvider and module-level capture. Null when the API key is unset. */
export function getPostHog(): PostHogClient | null {
  if (!API_KEY) return null;
  if (!client) {
    // Lazy load so capture is a no-op in tests / CI without pulling React Native.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PostHog = require("posthog-react-native").default as new (
      apiKey: string,
      options?: { host?: string; captureAppLifecycleEvents?: boolean },
    ) => PostHogClient;
    client = new PostHog(API_KEY, {
      host: HOST,
      captureAppLifecycleEvents: false,
    });
  }
  return client;
}

function scrub(props?: AnalyticsProps): Record<string, string | number | boolean | null> | undefined {
  if (!props) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function capture(event: AnalyticsEvent, props?: AnalyticsProps): void {
  getPostHog()?.capture(event, scrub(props));
}

export function identify(distinctId: string, traits?: AnalyticsProps): void {
  getPostHog()?.identify(distinctId, scrub(traits));
}

export function resetAnalytics(): void {
  getPostHog()?.reset();
}

export function markOnboardingStart(): void {
  if (onboardingStartedAt == null) onboardingStartedAt = Date.now();
}

export function onboardingDurationSeconds(): number {
  if (onboardingStartedAt == null) return 0;
  return Math.max(0, Math.round((Date.now() - onboardingStartedAt) / 1000));
}

/** Deduped screen_viewed helper for MainShell overlays/tabs. */
export function trackScreen(screenName: string): void {
  if (!screenName || screenName === lastScreen) return;
  lastScreen = screenName;
  capture("screen_viewed", { screen_name: screenName });
}

/** Cold start once; warm reopen when returning from background. */
export function trackAppOpened(source: "cold" | "warm", userId?: string | null): void {
  if (source === "cold") {
    if (appOpenedOnce) return;
    appOpenedOnce = true;
  }
  capture("app_opened", {
    user_id: userId ?? null,
    session_id: analyticsSessionId,
    source,
  });
}
