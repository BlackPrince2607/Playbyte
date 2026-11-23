import type { EngineMeta } from "../../core/engine";

export const spotMeta: EngineMeta = {
  id: "spot_difference",
  title: "Spot the Difference",
  version: 1,
  interaction: "canvas",
  scoreDirection: "higher_is_better",
  roundEndDelayMs: 2200,
  // Theme packs (picture sets), not interest categories like Bollywood / Mythology.
  variations: [
    { id: "shapes", title: "Objects", description: "Indoor scenes with sneaky edits", categories: ["shapes"] },
    { id: "city", title: "City Night", description: "City lights — what changed?", categories: ["city"] },
    { id: "garden", title: "Garden", description: "Parks and flowers with a few edits", categories: ["garden"] },
    { id: "space", title: "Space", description: "Galaxies and nebulae — look carefully", categories: ["space"] },
  ],
};
