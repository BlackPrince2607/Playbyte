import { arrowMeta } from "../meta";
import { createArrowEngine } from "./engine";

/** `durationMs` is the clock for each board (resets when a board clears). */
export const arrowEngine = createArrowEngine(arrowMeta, {
  s20: { durationMs: 10_000 },
  s25: { durationMs: 12_000 },
});
