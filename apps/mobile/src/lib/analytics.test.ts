import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyticsConfigured,
  analyticsSessionId,
  capture,
  identify,
  markOnboardingStart,
  onboardingDurationSeconds,
  resetAnalytics,
  trackAppOpened,
  trackScreen,
} from "./analytics";

describe("product analytics", () => {
  it("is a no-op without EXPO_PUBLIC_POSTHOG_API_KEY", () => {
    assert.equal(analyticsConfigured(), false);
    assert.ok(analyticsSessionId.length > 0);
    // Must not throw when the SDK client is absent.
    capture("app_opened", { source: "cold" });
    identify("guest:test");
    resetAnalytics();
    trackScreen("feed");
    trackScreen("feed"); // dedupe
    trackAppOpened("cold");
    trackAppOpened("cold"); // once
    markOnboardingStart();
    assert.ok(onboardingDurationSeconds() >= 0);
  });
});
