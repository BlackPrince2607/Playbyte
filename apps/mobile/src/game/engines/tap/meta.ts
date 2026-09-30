import type { EngineMeta } from "../../core/engine";

export const tapMeta: EngineMeta = {
  id: "tap",
  title: "Tap",
  version: 1,
  interaction: "playfield",
  scoreDirection: "higher_is_better",
  tickMs: 100,
  roundEndDelayMs: 1600,
  variations: [
    { id: "rush", title: "Target Rush", description: "Tap the targets before they vanish", categories: ["arcade"] },
    { id: "moles", title: "Whack-a-Mole", description: "Bop the moles as they pop up", categories: ["arcade"] },
    { id: "reaction", title: "Reaction", description: "Wait for green, then tap as fast as you can", categories: ["arcade"] },
  ],
};
