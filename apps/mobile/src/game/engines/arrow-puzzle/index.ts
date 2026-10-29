import type { EngineModule } from "../../ui/types";
import { arrowEngine } from "./logic/arrowPuzzle";
import { ArrowView } from "./ui/ArrowView";

const mod: EngineModule = { engine: arrowEngine, View: ArrowView, targetResponseMs: 700, quietOutcomes: true };
export default mod;
