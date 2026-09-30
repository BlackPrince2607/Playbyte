import type { ContentItem } from "../../../content/types";
import type { Json } from "../../../core/types";
import { QUIZ_DIMENSIONS, createQuizEngine, quizDifficulty } from "../../quiz/logic/engine";
import type { BuildContext, Clue, PoolItem, QuizQuestion, QuizStrategies, QuizStrategy } from "../../quiz/logic/types";
import { factFakeMeta } from "../meta";

export const FACT_ID = "fact";
export const FAKE_ID = "fake";

type PoolFact = { text: string; isTrue: boolean; explanation?: string };

/** Any item with statements can feed Fact or Fake; its emoji becomes the card's context art. */
export function factToPool(item: ContentItem): PoolItem | null {
  const facts: PoolFact[] = (item.facts ?? []).map((f) => ({ text: f.text, isTrue: f.isTrue, ...(f.explanation ? { explanation: f.explanation } : {}) }));
  if (!facts.length) return null;
  const clues: Clue[] = [];
  for (const m of item.media ?? []) if (m.kind === "emoji") clues.push({ kind: "emoji", value: m.value });
  return { id: item.id, answer: item.answer ?? item.id, difficulty: item.difficulty, clues, attrs: { facts: facts as unknown as Json } };
}

/** One statement per card; true and fake statements are served about equally often. */
export function factBuild({ item, rng }: BuildContext): QuizQuestion | null {
  const facts = (item.attrs?.facts ?? []) as unknown as PoolFact[];
  if (!facts.length) return null;
  const wantTrue = rng.chance(0.5);
  const preferred = facts.filter((f) => f.isTrue === wantTrue);
  const fact = rng.pick(preferred.length ? preferred : facts);
  return {
    id: `${item.id}#${facts.indexOf(fact)}`,
    prompt: fact.text,
    clues: item.clues,
    options: [
      { id: FAKE_ID, label: "Fake" },
      { id: FACT_ID, label: "Fact" },
    ],
    answerId: fact.isTrue ? FACT_ID : FAKE_ID,
    explanation: fact.explanation,
  };
}

const strategy = (categories?: string[]): QuizStrategy => ({
  types: ["fact"],
  prompt: "Fact or fake?",
  categories,
  toPool: factToPool,
  build: factBuild,
  minItems: 8,
});

export const FACT_STRATEGIES: QuizStrategies = Object.fromEntries(
  factFakeMeta.variations.map((v) => [v.id, strategy(v.categories)]),
);

/** Two fixed options; difficulty comes from which statements are served and how long you get to read. */
export const FACT_DIMENSIONS = QUIZ_DIMENSIONS.map((d) =>
  d.key === "optionCount"
    ? { ...d, easy: 2, hard: 2 }
    : d.key === "similarity"
      ? { ...d, easy: 0, hard: 0 }
      : d.key === "timeLimitMs"
        ? { ...d, easy: 12_000, hard: 6_000 }
        : d.key === "startClues"
          ? { ...d, easy: 1, hard: 1 }
          : d,
);

export const factFakeEngine = createQuizEngine({
  meta: factFakeMeta,
  strategies: FACT_STRATEGIES,
  defaultRounds: 10,
  difficulty: quizDifficulty(FACT_DIMENSIONS),
  hints: false,
});
