import type { EngineMeta } from "../../core/engine";

export const choiceMeta: EngineMeta = {
  id: "choice",
  title: "This or That",
  version: 1,
  interaction: "cards",
  scoreDirection: "higher_is_better",
  roundEndDelayMs: 1800,
  variations: [
    { id: "this_or_that", title: "This or That", description: "Pick a side and see where the crowd stands" },
    { id: "food_fight", title: "Food Fight", description: "Chai or coffee? Biryani or pulao?", categories: ["food"] },
    { id: "desi", title: "Desi Debates", description: "The great Indian either-or", categories: ["india"] },
    { id: "crowd", title: "Read the Crowd", description: "Guess what most people picked" },
  ],
};
