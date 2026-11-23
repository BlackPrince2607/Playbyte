import type { EngineModule } from "../../ui/types";
import { mazeEngine } from "./logic/mazeEngine";
import { MazeHowTo } from "./ui/MazeHowTo";
import { MazeView } from "./ui/MazeView";

const mod: EngineModule = {
  engine: mazeEngine,
  View: MazeView,
  HowTo: MazeHowTo,
  targetResponseMs: 30_000,
};
export default mod;
