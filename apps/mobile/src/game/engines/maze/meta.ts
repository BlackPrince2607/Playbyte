import type { EngineMeta } from "../../core/engine";

export const mazeMeta: EngineMeta = {
  id: "maze",
  title: "Maze",
  version: 1,
  interaction: "canvas",
  scoreDirection: "higher_is_better",
  roundEndDelayMs: 1600,
  variations: [
    { id: "classic", title: "Maze Runner", description: "Find the way out before time runs out", categories: ["puzzle"] },
    { id: "gems", title: "Gem Hunt", description: "Grab every gem to unlock the exit", categories: ["puzzle"] },
    { id: "fog", title: "Into the Fog", description: "You can only see a few steps ahead", categories: ["puzzle"] },
    { id: "sprint", title: "Maze Sprint", description: "Five quick mazes, short clock", categories: ["puzzle"] },
  ],
};
