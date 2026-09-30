import type { EngineModule } from "../../ui/types";
import { choiceEngine } from "./logic/choice";
import { ChoiceView } from "./ui/ChoiceView";

const mod: EngineModule = { engine: choiceEngine, View: ChoiceView, targetResponseMs: 4000, quietOutcomes: true };
export default mod;
