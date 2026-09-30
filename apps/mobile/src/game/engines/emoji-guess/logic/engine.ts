import type { ContentItem } from "../../../content/types";
import { QUIZ_DIMENSIONS, createQuizEngine, defaultToPool, quizDifficulty } from "../../quiz/logic/engine";
import type { PoolItem, QuizStrategies } from "../../quiz/logic/types";
import { emojiGuessMeta } from "../meta";

/** Last-resort clue describing the answer's shape, e.g. `3 words · starts with "T"`. */
export function shapeClue(answer: string): string {
  const words = answer.trim().split(/\s+/);
  const first = answer.trim().charAt(0).toUpperCase();
  const size = words.length > 1 ? `${words.length} words` : `${answer.replace(/[^A-Za-z0-9\u00C0-\u024F]/g, "").length} letters`;
  return `${size} · starts with "${first}"`;
}

/** Emoji first, then editorial hints, then the answer-shape clue. Items without emoji are skipped. */
export function emojiToPool(item: ContentItem): PoolItem | null {
  const base = defaultToPool(item);
  if (!base || base.clues[0]?.kind !== "emoji") return null;
  return { ...base, clues: [...base.clues, { kind: "text", value: shapeClue(base.answer) }] };
}

export const EMOJI_STRATEGIES: QuizStrategies = {
  movie: { types: ["emoji_movie"], prompt: "Which movie is this?", toPool: emojiToPool, minItems: 8 },
  phrase: { types: ["emoji_phrase"], prompt: "Which phrase is this?", toPool: emojiToPool, minItems: 8 },
  word: { types: ["emoji_word"], prompt: "Which word do these make?", toPool: emojiToPool, minItems: 8 },
  song: { types: ["emoji_song"], prompt: "Which song is this?", toPool: emojiToPool, minItems: 8 },
  celebrity: { types: ["emoji_celebrity"], prompt: "Who is this?", toPool: emojiToPool, minItems: 8 },
  brand: { types: ["emoji_brand"], prompt: "Which brand is this?", toPool: emojiToPool, minItems: 8 },
};

/** Decoding emoji takes longer than recognising a flag; text hints are extra help, not the puzzle. */
const EMOJI_DIMENSIONS = QUIZ_DIMENSIONS.map((d) =>
  d.key === "timeLimitMs" ? { ...d, easy: 20_000, hard: 9_000 } : d.key === "startClues" ? { ...d, easy: 2, hard: 1 } : d,
);

export const emojiGuessEngine = createQuizEngine({
  meta: emojiGuessMeta,
  strategies: EMOJI_STRATEGIES,
  defaultRounds: 10,
  difficulty: quizDifficulty(EMOJI_DIMENSIONS),
});
