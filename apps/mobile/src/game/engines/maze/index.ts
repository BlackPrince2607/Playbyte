import type { EngineModule } from "../../ui/types";
import { mazeEngine } from "./logic/mazeEngine";
import { MazeView } from "./ui/MazeView";

const mod: EngineModule = { engine: mazeEngine, View: MazeView, targetResponseMs: 30_000 };
export default mod;
