import { wordSearchMeta } from "../meta";
import { createWordSearchEngine } from "./engine";

export const wordSearchEngine = createWordSearchEngine(wordSearchMeta);
