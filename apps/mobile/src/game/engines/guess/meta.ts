import type { EngineMeta } from "../../core/engine";

export const guessMeta: EngineMeta = {
  id: "guess",
  title: "Guess",
  version: 1,
  interaction: "choice",
  scoreDirection: "higher_is_better",
  roundEndDelayMs: 1100,
  variations: [
    { id: "flag", title: "Flags", description: "Name the country from its flag", categories: ["geo"] },
    { id: "indian_state", title: "Indian States", description: "Guess the state from clues", categories: ["geo"] },
    { id: "food", title: "Food", description: "Name the dish", categories: ["food"] },
    { id: "landmark", title: "Landmarks", description: "Name the landmark from clues", categories: ["geo"] },
    { id: "movie", title: "Movies", description: "Guess the movie from clues", categories: ["movies"], available: false },
    { id: "dialogue", title: "Dialogues", description: "Which movie is this line from?", categories: ["movies"], available: false },
    { id: "cricket", title: "Cricketers", description: "Guess the cricketer", categories: ["cricket"], available: false },
    { id: "logo", title: "Logos", description: "Pending legal review", available: false },
    { id: "brand", title: "Brands", description: "Pending legal review", available: false },
  ],
};
