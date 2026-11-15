import type { EngineMeta } from "../../core/engine";

export const laneDashMeta: EngineMeta = {
  id: "lane_dash",
  title: "Lane Dash",
  version: 1,
  interaction: "playfield",
  scoreDirection: "higher_is_better",
  tickMs: 50,
  roundEndDelayMs: 1800,
  variations: [
    {
      id: "classic",
      title: "Classic",
      description: "Dodge obstacles in three lanes. Survive the run.",
      categories: ["arcade"],
    },
  ],
};
