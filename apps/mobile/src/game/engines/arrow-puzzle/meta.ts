import type { EngineMeta } from "../../core/engine";

export const arrowMeta: EngineMeta = {
  id: "arrow_puzzle",
  title: "Arrow Rush",
  version: 2,
  interaction: "grid",
  scoreDirection: "higher_is_better",
  variations: [
    { id: "s20", title: "Arrow Puzzle", description: "Clear the board. The clock counts up — faster is better. Blocked taps add 1 second.", categories: ["puzzle"] },
    { id: "s25", title: "Arrow Puzzle+", description: "Same stopwatch clear, denser board.", categories: ["puzzle"] },
  ],
};
