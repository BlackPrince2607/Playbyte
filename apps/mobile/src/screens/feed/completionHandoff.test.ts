import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { completionHandoffPlan } from "./completionHandoff";

describe("completionHandoffPlan", () => {
  it("does nothing while still playing", () => {
    assert.deepEqual(completionHandoffPlan("playing", false), {
      runSideEffects: false,
      scheduleHandoff: false,
    });
  });

  it("runs side effects and schedules on first completed entry", () => {
    assert.deepEqual(completionHandoffPlan("completed", false), {
      runSideEffects: true,
      scheduleHandoff: true,
    });
  });

  it("still schedules after callback-identity churn cleared the prior timeout", () => {
    // finished flag already set — must NOT skip scheduleHandoff (that was the stuck result screen).
    assert.deepEqual(completionHandoffPlan("completed", true), {
      runSideEffects: false,
      scheduleHandoff: true,
    });
  });
});
