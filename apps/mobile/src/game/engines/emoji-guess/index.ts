import type { EngineModule } from "../../ui/types";
import { QuizView } from "../quiz/ui/QuizView";
import { emojiGuessEngine } from "./logic/engine";

const mod: EngineModule = { engine: emojiGuessEngine, View: QuizView, targetResponseMs: 7000 };
export default mod;
