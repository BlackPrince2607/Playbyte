import type { EngineModule } from "../../ui/types";
import { mathRushEngine } from "./logic/engine";
import { MathRushView } from "./ui/MathRushView";

const mod: EngineModule = {
  engine: mathRushEngine,
  View: MathRushView,
  targetResponseMs: 2800,
};
export default mod;
