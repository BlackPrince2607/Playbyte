import type { EngineModule } from "../../ui/types";
import { connectDotsEngine } from "./logic/connectDots";
import { ConnectHowTo } from "./ui/ConnectHowTo";
import { ConnectView } from "./ui/ConnectView";

const mod: EngineModule = {
  engine: connectDotsEngine,
  View: ConnectView,
  HowTo: ConnectHowTo,
  targetResponseMs: 45_000,
  quietOutcomes: true,
};
export default mod;
