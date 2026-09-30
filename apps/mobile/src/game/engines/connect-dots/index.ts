import type { EngineModule } from "../../ui/types";
import { connectDotsEngine } from "./logic/connectDots";
import { ConnectView } from "./ui/ConnectView";

const mod: EngineModule = { engine: connectDotsEngine, View: ConnectView, targetResponseMs: 45_000, quietOutcomes: true };
export default mod;
