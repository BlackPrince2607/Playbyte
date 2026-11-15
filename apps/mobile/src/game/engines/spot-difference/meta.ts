import type { EngineMeta } from "../../core/engine";

export const spotMeta: EngineMeta = {
  id: "spot_difference",
  title: "Spot the Difference",
  version: 1,
  interaction: "canvas",
  scoreDirection: "higher_is_better",
  roundEndDelayMs: 2200,
  variations: [
    { id: "shapes", title: "Objects", description: "Real indoor scenes with sneaky edits", categories: ["shapes"] },
    { id: "city", title: "City Night", description: "Real city photos — what changed?", categories: ["city"] },
    { id: "garden", title: "Garden", description: "Parks and flowers with a few edits", categories: ["garden"] },
    { id: "space", title: "Space", description: "Stars and nebulae — look carefully", categories: ["space"] },
  ],
};
