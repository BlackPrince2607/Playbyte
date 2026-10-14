import assert from "node:assert/strict";
import { test } from "node:test";
import { momentStatus, pairUp, type MomentStatusInput } from "./momentCard";

const base: MomentStatusInput = {
  respondError: "",
  shareError: "",
  answered: false,
  isQuiz: false,
  correctKnown: false,
  gotItRight: false,
  friend: null,
  myChoice: null,
};

test("errors win over everything else", () => {
  const s = momentStatus({ ...base, answered: true, respondError: "Server down", shareError: "nope", myChoice: "A" });
  assert.deepEqual(s, { text: "Server down", tone: "error" });
  assert.equal(momentStatus({ ...base, shareError: "Share failed" })?.tone, "error");
});

test("unanswered cards prompt the player", () => {
  assert.match(momentStatus(base)!.text, /how everyone voted/);
  assert.match(momentStatus({ ...base, isQuiz: true })!.text, /right/);
});

test("quiz feedback, then friend activity, then your answer", () => {
  const answered = { ...base, answered: true, myChoice: "Tea" };
  assert.deepEqual(momentStatus({ ...answered, isQuiz: true, correctKnown: true, gotItRight: true }), {
    text: "Correct!",
    tone: "good",
  });
  assert.equal(momentStatus({ ...answered, isQuiz: true, correctKnown: true })?.tone, "muted");
  assert.equal(momentStatus({ ...answered, friend: { name: "Ria", choice: "Coffee" } })?.text, "Ria chose Coffee");
  assert.equal(momentStatus(answered)?.text, "Your answer: Tea");
});

test("pairUp makes rows of two and keeps a lone last item", () => {
  assert.deepEqual(pairUp([1, 2, 3]), [[1, 2], [3]]);
  assert.deepEqual(pairUp([1, 2, 3, 4]), [
    [1, 2],
    [3, 4],
  ]);
  assert.deepEqual(pairUp([]), []);
});
