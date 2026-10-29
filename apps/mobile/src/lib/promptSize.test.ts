import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lineHeightFor, promptTextStyle } from "./promptSize";

describe("promptTextStyle", () => {
  it("keeps short questions at full size", () => {
    assert.equal(promptTextStyle("Chai or coffee?").fontSize, 30);
  });

  it("shrinks long questions and crowded cards, never below 18", () => {
    const long = "Which of these Indian cities hosted the first ever test match played on Indian soil back in the day?";
    assert.ok(promptTextStyle(long).fontSize < 30);
    assert.ok(promptTextStyle(long, { crowded: true }).fontSize < promptTextStyle(long).fontSize);
    assert.equal(promptTextStyle("x".repeat(400), { max: 18, crowded: true }).fontSize, 18);
  });

  it("gives Devanagari extra line height", () => {
    assert.ok(lineHeightFor("चाय या कॉफ़ी?", 20) > lineHeightFor("Chai or coffee?", 20));
  });
});
