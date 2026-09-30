import type { Rng } from "../../../core/rng";
import type { QuizParams, QuizQuestion } from "../../quiz/logic/types";

/** Emoji pairs by how hard they are to tell apart (only widely supported emoji). */
export const LOOKALIKES: [string, string][][] = [
  [
    ["🔴", "🔵"],
    ["🍎", "🍌"],
    ["🐶", "🐱"],
    ["⭐", "🌙"],
    ["❤️", "💙"],
    ["🚗", "🚲"],
  ],
  [
    ["🔴", "🟠"],
    ["🍎", "🍅"],
    ["🐑", "🐐"],
    ["🌲", "🌳"],
    ["🟦", "🟪"],
    ["🍊", "🍑"],
    ["🙂", "🙃"],
    ["🌑", "🌚"],
  ],
  [
    ["😀", "😃"],
    ["😃", "😄"],
    ["😐", "😑"],
    ["🕐", "🕑"],
    ["🌖", "🌗"],
    ["😆", "😂"],
    ["😊", "🙂"],
    ["🕒", "🕓"],
  ],
];

/** Grid of identical emoji with one lookalike; grid size and pair subtlety grow with difficulty. */
export function lookalikeQuestion(rng: Rng, params: QuizParams, round: number): QuizQuestion {
  const d = Math.min(1, Math.max(0, (params.targetDifficulty - 0.15) / 0.7));
  const tier = d < 0.34 ? 0 : d < 0.67 ? 1 : 2;
  const [a, b] = rng.pick(LOOKALIKES[tier]);
  const [base, odd] = rng.chance(0.5) ? [a, b] : [b, a];
  const count = [4, 9, 12, 16][Math.min(3, Math.round(d * 3))];
  const oddAt = rng.int(0, count - 1);
  const answerId = `l${round}-${oddAt}`;
  return {
    id: `look-${round}-${base}${odd}`,
    prompt: "Find the odd one out",
    clues: [{ kind: "text", value: "One tile is slightly different" }],
    options: Array.from({ length: count }, (_, i) => ({
      id: `l${round}-${i}`,
      label: "",
      emoji: i === oddAt ? odd : base,
      alt: `Tile ${i + 1}`,
    })),
    answerId,
  };
}
