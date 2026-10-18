import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextDailyStreak, previousLocalDate } from "./dailyStreak";

describe("nextDailyStreak", () => {
  it("does not add another streak on the same local day", () => {
    assert.equal(nextDailyStreak(3, "2026-10-18", "2026-10-18"), 3);
  });

  it("adds one when the last visit was yesterday", () => {
    assert.equal(nextDailyStreak(3, "2026-10-17", "2026-10-18"), 4);
  });

  it("starts at 1 after a missed day", () => {
    assert.equal(nextDailyStreak(9, "2026-10-15", "2026-10-18"), 1);
  });

  it("resets an inflated count that has no saved date", () => {
    assert.equal(nextDailyStreak(5, null, "2026-10-18"), 1);
  });

  it("steps the calendar back one local day", () => {
    assert.equal(previousLocalDate("2026-03-01"), "2026-02-28");
  });
});
