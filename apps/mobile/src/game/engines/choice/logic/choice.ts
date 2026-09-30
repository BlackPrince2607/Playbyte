import { choiceMeta } from "../meta";
import { createChoiceEngine } from "./engine";

export const choiceEngine = createChoiceEngine({
  meta: choiceMeta,
  variations: {
    this_or_that: { mode: "prefer" },
    food_fight: { mode: "prefer" },
    desi: { mode: "prefer" },
    crowd: { mode: "predict" },
  },
});
