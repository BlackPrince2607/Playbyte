import type { ContentItem } from "../../../content/types";
import { createQuizEngine, defaultToPool } from "../../quiz/logic/engine";
import type { PoolItem, QuizStrategies } from "../../quiz/logic/types";
import { guessMeta } from "../meta";

/** Dialogue variation: the quote is the first clue, then the item's regular clues. */
function dialogueToPool(item: ContentItem): PoolItem | null {
  const base = defaultToPool(item);
  const line = item.attributes.dialogue;
  if (!base || typeof line !== "string") return null;
  return { ...base, clues: [{ kind: "text", value: `“${line}”` }, ...base.clues.filter((c) => c.kind === "text")] };
}

export const GUESS_STRATEGIES: QuizStrategies = {
  flag: { types: ["flag"], prompt: "Which country's flag is this?", minItems: 8 },
  indian_state: { types: ["indian_state"], prompt: "Which state is this?", minItems: 8 },
  food: { types: ["food"], prompt: "Name this dish", minItems: 8 },
  landmark: { types: ["landmark"], prompt: "Name this landmark", minItems: 8 },
  movie: { types: ["movie"], prompt: "Guess the movie", minItems: 8 },
  dialogue: { types: ["movie"], prompt: "Which movie is this line from?", toPool: dialogueToPool, minItems: 8 },
  cricket: { types: ["cricketer"], prompt: "Guess the cricketer", minItems: 8 },
  logo: { types: ["logo"], prompt: "Whose logo is this?", minItems: 8 },
  brand: { types: ["brand"], prompt: "Name the brand", minItems: 8 },
};

export const guessEngine = createQuizEngine({ meta: guessMeta, strategies: GUESS_STRATEGIES, defaultRounds: 10 });
