import type { EngineModule } from "../../ui/types";
import { spotEngine } from "./logic/spot";
import { SpotHowTo } from "./ui/SpotHowTo";
import { SpotView } from "./ui/SpotView";

const mod: EngineModule = {
  engine: spotEngine,
  View: SpotView,
  HowTo: SpotHowTo,
  targetResponseMs: 9000,
  quietOutcomes: true,
};
export default mod;
