import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FeedMoment } from "../api";
import { attachLocalAnswer, scoreLocalVote, withLocalAnswers } from "./localResponses";

const moment = (over: Partial<FeedMoment> = {}): FeedMoment => ({
  type: "moment",
  id: "m1",
  cardType: "poll",
  prompt: "Chai or coffee?",
  options: [
    { id: "o1", label: "Chai", sortOrder: 0 },
    { id: "o2", label: "Coffee", sortOrder: 1 },
  ],
  myOptionId: null,
  result: null,
  category: null,
  ...over,
});

describe("scoreLocalVote", () => {
  it("sets myOptionId and bumps the chosen option", () => {
    const next = scoreLocalVote(moment(), "o2");
    assert.equal(next.myOptionId, "o2");
    assert.equal(next.result?.totalResponses, 1);
    assert.equal(next.result?.optionCounts.o2, 1);
    assert.equal(next.result?.optionCounts.o1 ?? 0, 0);
  });

  it("adds on top of an existing crowd snapshot", () => {
    const next = scoreLocalVote(
      moment({
        result: { totalResponses: 10, optionCounts: { o1: 7, o2: 3 }, correctOptionId: null },
      }),
      "o1",
    );
    assert.equal(next.result?.totalResponses, 11);
    assert.equal(next.result?.optionCounts.o1, 8);
    assert.equal(next.result?.optionCounts.o2, 3);
  });
});

describe("attachLocalAnswer", () => {
  it("restores a pick without inventing a new vote", () => {
    const next = attachLocalAnswer(moment(), "o1");
    assert.equal(next.myOptionId, "o1");
    assert.equal(next.result?.totalResponses, 0);
  });

  it("leaves a server answer alone", () => {
    const answered = moment({ myOptionId: "o2", result: { totalResponses: 5, optionCounts: { o2: 5 } } });
    assert.equal(attachLocalAnswer(answered, "o1"), answered);
  });

  it("ignores unknown option ids", () => {
    const base = moment();
    assert.equal(attachLocalAnswer(base, "nope"), base);
  });
});

describe("withLocalAnswers", () => {
  it("hydrates moments that the server has not answered yet", () => {
    const [hydrated] = withLocalAnswers([moment()], { m1: "o2" });
    assert.equal(hydrated.type, "moment");
    if (hydrated.type === "moment") assert.equal(hydrated.myOptionId, "o2");
  });
});
