import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { timeAgo } from "./timeAgo";

describe("timeAgo", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");

  it("buckets elapsed time", () => {
    assert.equal(timeAgo("2026-10-09T11:59:30Z", now), "now");
    assert.equal(timeAgo("2026-10-09T11:55:00Z", now), "5m");
    assert.equal(timeAgo("2026-10-09T09:00:00Z", now), "3h");
    assert.equal(timeAgo("2026-10-07T12:00:00Z", now), "2d");
    assert.equal(timeAgo("2026-09-11T12:00:00Z", now), "4w");
  });

  it("handles missing, invalid and future timestamps", () => {
    assert.equal(timeAgo(null, now), "");
    assert.equal(timeAgo("not a date", now), "now");
    assert.equal(timeAgo("2026-10-09T13:00:00Z", now), "now");
  });
});
