import type { EngineMeta } from "../../core/engine";

export const factFakeMeta: EngineMeta = {
  id: "fact_fake",
  title: "Fact or Fake",
  version: 1,
  interaction: "cards",
  scoreDirection: "higher_is_better",
  roundEndDelayMs: 2400,
  variations: [
    { id: "mixed", title: "Mixed Bag", description: "Science, India, sport and cinema" },
    { id: "india", title: "India", description: "History, places and culture", categories: ["india"] },
    { id: "science", title: "Science", description: "Space, animals and the human body", categories: ["science", "space", "animals", "body"] },
    { id: "sports", title: "Sports", description: "Cricket, Olympics and more", categories: ["sports"] },
    { id: "entertainment", title: "Entertainment", description: "Movies and music", categories: ["entertainment"] },
  ],
};
