import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getContentLocale, setContentLocale } from "./contentLocale";

describe("contentLocale", () => {
  it("maps app language to pack locale for dual invent pools", () => {
    setContentLocale("en");
    assert.equal(getContentLocale(), "en-IN");
    setContentLocale("hi");
    assert.equal(getContentLocale(), "hi-IN");
    setContentLocale("en");
    assert.equal(getContentLocale(), "en-IN");
  });
});
