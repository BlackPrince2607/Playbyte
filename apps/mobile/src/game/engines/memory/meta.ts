import type { EngineMeta } from "../../core/engine";

export const memoryMeta: EngineMeta = {
  id: "memory",
  title: "Find the Pair",
  version: 1,
  interaction: "grid",
  scoreDirection: "higher_is_better",
  tickMs: 50,
  roundEndDelayMs: 1600,
  variations: [
    {
      id: "pairs",
      title: "Pairs",
      description: "Flip cards and match every pair before time runs out",
      categories: ["puzzle"],
    },
  ],
};
