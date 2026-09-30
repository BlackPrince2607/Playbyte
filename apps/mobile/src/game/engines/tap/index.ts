import type { EngineModule } from "../../ui/types";
import { tapEngine } from "./logic/tap";
import { TapView } from "./ui/TapView";

const mod: EngineModule = { engine: tapEngine, View: TapView, targetResponseMs: 700, quietOutcomes: true };
export default mod;
