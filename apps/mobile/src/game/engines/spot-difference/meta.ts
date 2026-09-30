import type { EngineMeta } from "../../core/engine";

export const spotMeta: EngineMeta = {
  id: "spot_difference",
  title: "Spot the Difference",
  version: 1,
  interaction: "canvas",
  scoreDirection: "higher_is_better",
  roundEndDelayMs: 2200,
  variations: [
    { id: "shapes", title: "Shapes", description: "Neon shapes, tiny changes", categories: ["visual"] },
    { id: "city", title: "City Night", description: "Windows, stars and skyscrapers", categories: ["visual"] },
    { id: "garden", title: "Garden", description: "Flowers, clouds and butterflies", categories: ["visual"] },
    { id: "space", title: "Space", description: "Planets, rings and rockets", categories: ["visual"] },
  ],
};
