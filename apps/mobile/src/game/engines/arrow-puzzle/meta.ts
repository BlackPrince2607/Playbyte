import type { EngineMeta } from "../../core/engine";

export const arrowMeta: EngineMeta = {
  id: "arrow_puzzle",
  title: "Arrow Rush",
  version: 1,
  interaction: "grid",
  scoreDirection: "higher_is_better",
  variations: [
    { id: "s20", title: "20s Arrow Puzzle", description: "Clear every arrow with an open path. 20 seconds.", categories: ["puzzle"] },
    { id: "s25", title: "25s Arrow Puzzle", description: "The same rush with 25 seconds on the clock.", categories: ["puzzle"] },
  ],
};
