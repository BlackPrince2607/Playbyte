import { QUIZ_DIMENSIONS, createQuizEngine, quizDifficulty } from "../../quiz/logic/engine";
import type { QuizStrategies } from "../../quiz/logic/types";
import { oddOneOutMeta } from "../meta";
import { groupBuild, groupToPool } from "./groups";
import { lookalikeQuestion } from "./lookalike";
import { numbersQuestion } from "./numbers";

export const ODD_STRATEGIES: QuizStrategies = {
  words: {
    types: ["word_group"],
    prompt: "Which one doesn't belong?",
    toPool: groupToPool(false),
    build: groupBuild("Which one doesn't belong?", true),
    minItems: 6,
  },
  emoji: {
    types: ["word_group"],
    prompt: "Which picture doesn't belong?",
    toPool: groupToPool(true),
    build: groupBuild("Which picture doesn't belong?", false),
    minItems: 6,
  },
  numbers: { types: [], prompt: "Which number doesn't fit?", procedural: numbersQuestion },
  lookalike: { types: [], prompt: "Find the odd one out", procedural: lookalikeQuestion },
};

/** 4 cards (2x2) up to 6 (2x3); one category hint, earned via the hint button. */
const ODD_DIMENSIONS = QUIZ_DIMENSIONS.map((d) =>
  d.key === "optionCount"
    ? { ...d, easy: 4, hard: 6 }
    : d.key === "similarity"
      ? { ...d, easy: 0.1, hard: 0.9 }
      : d.key === "timeLimitMs"
        ? { ...d, easy: 15_000, hard: 6_000 }
        : d.key === "startClues"
          ? { ...d, easy: 1, hard: 1 }
          : d,
);

export const oddOneOutEngine = createQuizEngine({
  meta: oddOneOutMeta,
  strategies: ODD_STRATEGIES,
  defaultRounds: 10,
  difficulty: quizDifficulty(ODD_DIMENSIONS),
});
