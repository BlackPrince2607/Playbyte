import type { EngineModule } from "../../ui/types";
import { factFakeEngine } from "./logic/engine";
import { FactView } from "./ui/FactView";

const mod: EngineModule = { engine: factFakeEngine, View: FactView, targetResponseMs: 5000 };
export default mod;
