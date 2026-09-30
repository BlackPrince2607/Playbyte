import type { EngineMeta } from "../../core/engine";

export const wordSearchMeta: EngineMeta = {
  id: "word_search",
  title: "Word Search",
  version: 1,
  interaction: "grid",
  scoreDirection: "higher_is_better",
  roundEndDelayMs: 1800,
  variations: [
    { id: "classic", title: "Classic", description: "Find the themed words in the grid", categories: ["words"] },
    { id: "blitz", title: "Blitz", description: "Smaller grids, much less time", categories: ["words"] },
    { id: "mystery", title: "Mystery", description: "Only the theme and word lengths are shown", categories: ["words"] },
  ],
};
