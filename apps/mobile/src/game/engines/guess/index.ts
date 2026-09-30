import type { EngineModule } from "../../ui/types";
import { QuizView } from "../quiz/ui/QuizView";
import { guessEngine } from "./logic/engine";

const mod: EngineModule = { engine: guessEngine, View: QuizView, targetResponseMs: 5000 };
export default mod;
