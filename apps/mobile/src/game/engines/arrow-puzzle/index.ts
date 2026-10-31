import type { EngineModule } from "../../ui/types";
import { arrowEngine } from "./logic/arrowPuzzle";
import { ArrowHowTo } from "./ui/ArrowHowTo";
import { ArrowView } from "./ui/ArrowView";

const mod: EngineModule = {
  engine: arrowEngine,
  View: ArrowView,
  HowTo: ArrowHowTo,
  targetResponseMs: 700,
  quietOutcomes: true,
};
export default mod;
