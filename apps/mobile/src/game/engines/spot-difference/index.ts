import type { EngineModule } from "../../ui/types";
import { spotEngine } from "./logic/spot";
import { SpotView } from "./ui/SpotView";

const mod: EngineModule = { engine: spotEngine, View: SpotView, targetResponseMs: 9000, quietOutcomes: true };
export default mod;
