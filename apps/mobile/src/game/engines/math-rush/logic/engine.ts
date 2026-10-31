import { QUIZ_DIMENSIONS, createQuizEngine, quizDifficulty } from "../../quiz/logic/engine";
import type { QuizStrategies } from "../../quiz/logic/types";
import { mathRushMeta } from "../meta";
import { mathQuestion } from "./problems";

export const MATH_STRATEGIES: QuizStrategies = {
  solve: { types: [], prompt: "Solve it!", procedural: mathQuestion("solve") },
  verify: { types: [], prompt: "True or trap?", procedural: mathQuestion("verify") },
  blitz: { types: [], prompt: "Solve it!", procedural: mathQuestion("solve") },
};

/**
 * Fast arcade math: few options, short clocks that tighten with level.
 * Blitz keeps the same params but seed uses more rounds + lives.
 */
const MATH_DIMENSIONS = QUIZ_DIMENSIONS.map((d) =>
  d.key === "optionCount"
    ? { ...d, easy: 4, hard: 4 }
    : d.key === "similarity"
      ? { ...d, easy: 0.4, hard: 0.9 }
      : d.key === "targetDifficulty"
        ? { ...d, easy: 0.1, hard: 0.95 }
        : d.key === "timeLimitMs"
          ? { ...d, easy: 8_000, hard: 3_500 }
          : d.key === "startClues"
            ? { ...d, easy: 1, hard: 1 }
            : d,
);

export const mathRushEngine = createQuizEngine({
  meta: mathRushMeta,
  strategies: MATH_STRATEGIES,
  defaultRounds: 12,
  difficulty: quizDifficulty(MATH_DIMENSIONS),
  hints: true,
});
