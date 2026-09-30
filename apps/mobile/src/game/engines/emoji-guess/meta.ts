import type { EngineMeta } from "../../core/engine";

export const emojiGuessMeta: EngineMeta = {
  id: "emoji_guess",
  title: "Emoji Guess",
  version: 1,
  interaction: "choice",
  scoreDirection: "higher_is_better",
  roundEndDelayMs: 1100,
  variations: [
    { id: "movie", title: "Movies", description: "Decode the movie from emoji", categories: ["movies"] },
    { id: "phrase", title: "Phrases", description: "Idioms and sayings in emoji", categories: ["phrases"] },
    { id: "word", title: "Words", description: "Compound words in emoji", categories: ["words"] },
    { id: "song", title: "Songs", description: "Decode the song", categories: ["music"], available: false },
    { id: "celebrity", title: "Celebrities", description: "Guess who", categories: ["people"], available: false },
    { id: "brand", title: "Brands", description: "Pending legal review", available: false },
  ],
};
