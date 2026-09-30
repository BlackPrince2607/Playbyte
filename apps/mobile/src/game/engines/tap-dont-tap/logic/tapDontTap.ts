import { TAP_DIMENSIONS, createTapEngine, tapDifficulty } from "../../tap/logic/engine";
import type { TapRule } from "../../tap/logic/types";
import { tapDontTapMeta } from "../meta";

/** Decisions, not just reflexes: more decoys, and targets live a little longer so there is time to judge. */
export const TDT_DIMENSIONS = TAP_DIMENSIONS.map((d) => {
  switch (d.key) {
    case "decoyRatio":
      return { ...d, easy: 0.3, hard: 0.45 };
    case "bonusRatio":
      return { ...d, easy: 0.04, hard: 0.08 };
    case "ttlMs":
      return { ...d, easy: 2100, hard: 1000 };
    case "spawnMs":
      return { ...d, easy: 800, hard: 420 };
    case "drift":
      return { ...d, easy: 0, hard: 0.12 };
    default:
      return d;
  }
});

const GREEN: TapRule = { tap: ["🟢"], avoid: ["🔴"], bonus: ["🌟"], tapLabel: "green", avoidLabel: "red" };
const RED: TapRule = { tap: ["🔴"], avoid: ["🟢"], bonus: ["🌟"], tapLabel: "red", avoidLabel: "green" };
const FRUIT: TapRule = { tap: ["🍎", "🍌", "🍇", "🍉", "🍓", "🥭"], avoid: ["🍔", "🍟", "🍩", "🍕"], bonus: ["🍍"], tapLabel: "fruit", avoidLabel: "junk food" };
const BALLOONS: TapRule = { tap: ["🎈"], avoid: ["💣"], bonus: ["💎"], tapLabel: "balloons", avoidLabel: "bombs" };

export const tapDontTapEngine = createTapEngine({
  meta: tapDontTapMeta,
  difficulty: tapDifficulty(TDT_DIMENSIONS),
  variations: {
    flip: { mode: "rush", rounds: 4, roundMs: 10_000, rule: (round) => (round % 2 === 1 ? GREEN : RED) },
    fruit: { mode: "rush", rounds: 3, roundMs: 12_000, rule: () => FRUIT },
    balloons: { mode: "rush", rounds: 3, roundMs: 12_000, rule: () => BALLOONS },
  },
});
