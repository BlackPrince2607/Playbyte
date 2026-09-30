import { mazeMeta } from "../meta";
import { createMazeEngine } from "./engine";

export const mazeEngine = createMazeEngine(mazeMeta, {
  classic: { rounds: 3 },
  gems: { rounds: 3, gems: true, timeScale: 1.4 },
  fog: { rounds: 3, fog: 2, timeScale: 1.3 },
  sprint: { rounds: 5, sizeDelta: -2, timeScale: 0.6 },
});
