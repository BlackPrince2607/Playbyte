import type { EngineMeta } from "../../core/engine";

export const arrowMeta: EngineMeta = {
  id: "arrow_puzzle",
  title: "Arrow Rush",
  version: 1,
  interaction: "grid",
  scoreDirection: "higher_is_better",
  variations: [
    { id: "s20", title: "Arrow Puzzle", description: "Clear every arrow with an open path. 10 seconds per board.", categories: ["puzzle"] },
    { id: "s25", title: "Arrow Puzzle+", description: "The same rush with 12 seconds per board.", categories: ["puzzle"] },
  ],
};
