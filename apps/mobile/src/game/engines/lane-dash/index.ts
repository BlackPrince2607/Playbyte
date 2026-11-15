import type { EngineModule } from "../../ui/types";
import { laneDashEngine } from "./logic/engine";
import { LaneDashView } from "./ui/LaneDashView";
import { LaneHowTo } from "./ui/LaneHowTo";

const mod: EngineModule = {
  engine: laneDashEngine,
  View: LaneDashView,
  HowTo: LaneHowTo,
  targetResponseMs: 600,
  quietOutcomes: true,
};
export default mod;
