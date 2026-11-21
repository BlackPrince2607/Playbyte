import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyticsConfigured,
  analyticsSessionId,
  capture,
  gamePlayProps,
  identify,
  markOnboardingStart,
  onboardingDurationSeconds,
  resetAnalytics,
  retentionProps,
  trackAppOpened,
  trackScreen,
} from "./analytics";

describe("product analytics", () => {
  it("is a no-op without EXPO_PUBLIC_POSTHOG_API_KEY", () => {
    assert.equal(analyticsConfigured(), false);
    assert.ok(analyticsSessionId.length > 0);
    // Must not throw when the SDK client is absent.
    capture("app_opened", { source: "cold" });
    capture("user_activated", { game_id: "test" });
    capture("streak_claimed", { streak_count: 1 });
    capture("reminder_scheduled", { hour: 19 });
    identify("guest:test");
    resetAnalytics();
    trackScreen("feed");
    trackScreen("feed"); // dedupe
    trackAppOpened("cold");
    trackAppOpened("cold"); // once
    markOnboardingStart();
    assert.ok(onboardingDurationSeconds() >= 0);
    assert.equal(typeof retentionProps(), "object");
    assert.equal(typeof gamePlayProps({ source: "feed" }).is_first_play, "boolean");
  });
});
