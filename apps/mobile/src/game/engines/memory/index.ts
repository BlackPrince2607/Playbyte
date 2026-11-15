import type { EngineModule } from "../../ui/types";
import { memoryEngine } from "./logic/engine";
import { PairHowTo } from "./ui/PairHowTo";
import { PairView } from "./ui/PairView";

const mod: EngineModule = {
  engine: memoryEngine,
  View: PairView,
  HowTo: PairHowTo,
  targetResponseMs: 8_000,
};
export default mod;
