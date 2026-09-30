import type { EngineModule } from "../../ui/types";
import { oddOneOutEngine } from "./logic/engine";
import { OddGridView } from "./ui/OddGridView";

const mod: EngineModule = { engine: oddOneOutEngine, View: OddGridView, targetResponseMs: 4000 };
export default mod;
