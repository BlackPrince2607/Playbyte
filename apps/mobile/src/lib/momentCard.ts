export type StatusTone = "error" | "good" | "muted";

export type MomentStatusInput = {
  respondError: string;
  shareError: string;
  answered: boolean;
  isQuiz: boolean;
  correctKnown: boolean;
  gotItRight: boolean;
  friend: { name: string; choice: string } | null;
  myChoice: string | null;
};

/**
 * The single line shown between the question and the answers. It has a fixed slot in the card,
 * so answering, errors or friend activity never push the answers around.
 */
export function momentStatus(s: MomentStatusInput): { text: string; tone: StatusTone } | null {
  if (s.respondError) return { text: s.respondError, tone: "error" };
  if (s.shareError) return { text: s.shareError, tone: "error" };
  if (!s.answered) {
    return { text: s.isQuiz ? "Pick the answer you think is right" : "Pick one to see how everyone voted", tone: "muted" };
  }
  if (s.isQuiz && s.correctKnown) {
    return s.gotItRight
      ? { text: "Correct!", tone: "good" }
      : { text: "Not this time. The right answer is ticked.", tone: "muted" };
  }
  if (s.friend) return { text: `${s.friend.name} chose ${s.friend.choice}`, tone: "muted" };
  if (s.myChoice) return { text: `Your answer: ${s.myChoice}`, tone: "good" };
  return null;
}

/** Splits answers into rows of two for the image grid. */
export function pairUp<T>(items: readonly T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}
