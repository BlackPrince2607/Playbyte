import type { EngineMeta } from "../../core/engine";

export const tapDontTapMeta: EngineMeta = {
  id: "tap_dont_tap",
  title: "Tap / Don't Tap",
  version: 1,
  interaction: "playfield",
  scoreDirection: "higher_is_better",
  tickMs: 100,
  roundEndDelayMs: 2000,
  variations: [
    { id: "flip", title: "Green Light, Red Light", description: "Tap green, skip red. Then the rules flip.", categories: ["arcade"] },
    { id: "fruit", title: "Fruit Frenzy", description: "Tap the fruit, never the junk food", categories: ["arcade"] },
    { id: "balloons", title: "Balloon Pop", description: "Pop balloons, dodge the bombs", categories: ["arcade"] },
  ],
};
