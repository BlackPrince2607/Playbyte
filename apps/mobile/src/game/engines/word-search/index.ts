import type { EngineModule } from "../../ui/types";
import { wordSearchEngine } from "./logic/wordSearch";
import { WordSearchView } from "./ui/WordSearchView";

const mod: EngineModule = { engine: wordSearchEngine, View: WordSearchView, targetResponseMs: 12_000, quietOutcomes: true };
export default mod;
