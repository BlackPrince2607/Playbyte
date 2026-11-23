import { arrowMeta } from "../meta";
import { createArrowEngine } from "./engine";

/** Both catalog keys share stopwatch rules; s25 is a denser board. */
export const arrowEngine = createArrowEngine(arrowMeta, {
  s20: {},
  s25: { sizeBoost: 0.4, fillBoost: 0.06 },
});
