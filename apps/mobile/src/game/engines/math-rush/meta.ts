import type { EngineMeta } from "../../core/engine";

export const mathRushMeta: EngineMeta = {
  id: "math_rush",
  title: "Math Rush",
  version: 1,
  interaction: "choice",
  scoreDirection: "higher_is_better",
  roundEndDelayMs: 850,
  variations: [
    {
      id: "solve",
      title: "Solve It",
      description: "Tap the right answer before the clock runs out. Gets harder fast.",
      categories: ["math"],
    },
    {
      id: "verify",
      title: "True or Trap",
      description: "Is the equation right or wrong? Decide in a flash.",
      categories: ["math"],
    },
    {
      id: "blitz",
      title: "Math Blitz",
      description: "Fifteen rapid-fire questions. Three lives. No mercy.",
      categories: ["math"],
    },
  ],
};
