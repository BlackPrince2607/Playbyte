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

/** Optional localized lines; English defaults keep unit tests stable. */
export type MomentStatusCopy = {
  pickQuizAnswer?: string;
  pickPollAnswer?: string;
  correctExclaim?: string;
  notThisTime?: string;
  friendChose?: string;
  yourAnswer?: string;
};

const DEFAULT_COPY = {
  pickQuizAnswer: "Pick the answer you think is right",
  pickPollAnswer: "Pick one to see how everyone voted",
  correctExclaim: "Correct!",
  notThisTime: "Not this time. The right answer is ticked.",
  friendChose: "{name} chose {choice}",
  yourAnswer: "Your answer: {choice}",
} as const;

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

/**
 * The single line shown between the question and the answers. It has a fixed slot in the card,
 * so answering, errors or friend activity never push the answers around.
 */
export function momentStatus(s: MomentStatusInput, copy: MomentStatusCopy = {}): { text: string; tone: StatusTone } | null {
  const c = { ...DEFAULT_COPY, ...copy };
  if (s.respondError) return { text: s.respondError, tone: "error" };
  if (s.shareError) return { text: s.shareError, tone: "error" };
  if (!s.answered) {
    return { text: s.isQuiz ? c.pickQuizAnswer : c.pickPollAnswer, tone: "muted" };
  }
  if (s.isQuiz && s.correctKnown) {
    return s.gotItRight
      ? { text: c.correctExclaim, tone: "good" }
      : { text: c.notThisTime, tone: "muted" };
  }
  if (s.friend) return { text: fill(c.friendChose, { name: s.friend.name, choice: s.friend.choice }), tone: "muted" };
  if (s.myChoice) return { text: fill(c.yourAnswer, { choice: s.myChoice }), tone: "good" };
  return null;
}

/** Splits answers into rows of two for the image grid. */
export function pairUp<T>(items: readonly T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}
