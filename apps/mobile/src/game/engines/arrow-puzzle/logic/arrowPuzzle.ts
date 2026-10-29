import { arrowMeta } from "../meta";
import { createArrowEngine } from "./engine";

export const arrowEngine = createArrowEngine(arrowMeta, {
  s20: { durationMs: 20_000 },
  s25: { durationMs: 25_000 },
});
