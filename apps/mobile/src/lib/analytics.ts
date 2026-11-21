type PostHogClient = import("posthog-react-native").default;

/** Product analytics events from the Events tracking sheet + retention suite. */
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
  | "share_clicked"
  | "user_activated"
  | "streak_claimed"
  | "streak_broken"
  | "reminder_scheduled"
  | "reminder_opened"
  | "reminder_permission_granted"
  | "reminder_permission_denied"
  | "streak_ritual_shown"
  | "streak_ritual_remind"
  | "streak_ritual_dismiss"
  | "daily_featured_viewed"
  | "daily_featured_played"
  | "friend_challenge_prompt_shown"
  | "friend_challenge_prompt_clicked";

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim() ?? "";
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

/** Stable for this JS process; used as session_id on app_opened. */
export const analyticsSessionId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

let client: PostHogClient | null = null;
let onboardingStartedAt: number | null = null;
let lastScreen: string | null = null;
let appOpenedOnce = false;

type RetentionState = {
  installDay: string;
  daysSinceInstall: number;
  sessionNumber: number;
  gamesCompleted: number;
  activated: boolean;
  isFirstSession: boolean;
};

let retention: RetentionState | null = null;
let retentionInit: Promise<RetentionState> | null = null;

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
  return Object.keys(out).length ? out : undefined;
}

export function capture(event: AnalyticsEvent, props?: AnalyticsProps): void {
  const cleaned = scrub(props);
  getPostHog()?.capture(event, cleaned);
  // Lazy: metaSdk pulls React Native / FBSDK, which must stay out of unit tests.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { logMetaEvent } = require("./metaSdk") as typeof import("./metaSdk");
    logMetaEvent(event, cleaned);
  } catch {
    /* Expo Go / tests / builds without the native module */
  }
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

/** Load install/session counters once per process (safe to call repeatedly). */
export async function initRetentionAnalytics(opts?: { bumpSession?: boolean }): Promise<RetentionState> {
  if (retention && !opts?.bumpSession) return retention;
  if (retentionInit && !opts?.bumpSession) return retentionInit;

  retentionInit = (async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store = require("./retentionStorage") as typeof import("./retentionStorage");
    const installDay = await store.ensureInstallDay();
    const sessionNumber = opts?.bumpSession
      ? await store.bumpSessionNumber()
      : (await store.getSessionNumber()) || (await store.bumpSessionNumber());
    const gamesCompleted = await store.getGamesCompletedLifetime();
    const activated = await store.isUserActivated();
    const days = store.daysSinceInstall(installDay);
    retention = {
      installDay,
      daysSinceInstall: days,
      sessionNumber,
      gamesCompleted,
      activated,
      isFirstSession: sessionNumber <= 1,
    };
    return retention;
  })();

  try {
    return await retentionInit;
  } finally {
    if (!opts?.bumpSession) {
      /* keep promise cached */
    } else {
      retentionInit = null;
    }
  }
}

export function retentionProps(): AnalyticsProps {
  if (!retention) return {};
  return {
    install_day: retention.installDay,
    days_since_install: retention.daysSinceInstall,
    session_number: retention.sessionNumber,
    is_first_session: retention.isFirstSession,
    games_completed_lifetime: retention.gamesCompleted,
    is_activated: retention.activated,
  };
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
    ...retentionProps(),
  });
}

/** Prefer this from AppContext so day-N props are attached. */
export async function trackAppOpenedAsync(source: "cold" | "warm", userId?: string | null): Promise<void> {
  await initRetentionAnalytics({ bumpSession: source === "cold" && !appOpenedOnce });
  trackAppOpened(source, userId);
}

export function gamePlayProps(extra?: AnalyticsProps): AnalyticsProps {
  const lifetime = retention?.gamesCompleted ?? 0;
  return {
    ...retentionProps(),
    is_first_play: lifetime === 0,
    games_completed_lifetime: lifetime,
    ...extra,
  };
}

/** Call after a finished play — emits game props updates + one-shot user_activated. */
export async function noteGameCompletedAnalytics(props: {
  gameId: string;
  score: number;
  durationSeconds: number;
}): Promise<{ isFirstPlay: boolean; activatedNow: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const store = require("./retentionStorage") as typeof import("./retentionStorage");
  await initRetentionAnalytics();
  const { count, isFirstPlay } = await store.incrementGamesCompleted();
  if (retention) {
    retention.gamesCompleted = count;
  }
  capture("game_completed", {
    game_id: props.gameId,
    score: props.score,
    duration_seconds: props.durationSeconds,
    is_first_play: isFirstPlay,
    games_completed_lifetime: count,
    ...retentionProps(),
  });
  let activatedNow = false;
  if (!retention?.activated) {
    activatedNow = await store.markUserActivated();
    if (activatedNow && retention) retention.activated = true;
    if (activatedNow) {
      capture("user_activated", {
        game_id: props.gameId,
        score: props.score,
        ...retentionProps(),
        games_completed_lifetime: count,
      });
    }
  }
  return { isFirstPlay, activatedNow };
}
