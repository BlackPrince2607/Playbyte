import type { EngineMeta } from "../../core/engine";

export const oddOneOutMeta: EngineMeta = {
  id: "odd_one_out",
  title: "Odd One Out",
  version: 1,
  interaction: "choice",
  scoreDirection: "higher_is_better",
  roundEndDelayMs: 1300,
  variations: [
    { id: "words", title: "Words", description: "Which word doesn't belong with the rest?", categories: ["words"] },
    { id: "emoji", title: "Emoji", description: "Which picture doesn't belong?", categories: ["words"] },
    { id: "numbers", title: "Numbers", description: "Spot the number that breaks the pattern", categories: ["math"] },
    { id: "lookalike", title: "Lookalikes", description: "Find the emoji that's slightly different", categories: ["visual"] },
  ],
};
