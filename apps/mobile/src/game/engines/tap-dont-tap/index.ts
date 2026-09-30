import type { EngineModule } from "../../ui/types";
import { TapView } from "../tap/ui/TapView";
import { tapDontTapEngine } from "./logic/tapDontTap";

const mod: EngineModule = { engine: tapDontTapEngine, View: TapView, targetResponseMs: 800, quietOutcomes: true };
export default mod;
