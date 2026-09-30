import { tapMeta } from "../meta";
import { createTapEngine } from "./engine";

export const tapEngine = createTapEngine({
  meta: tapMeta,
  variations: {
    rush: { mode: "rush", rounds: 3, roundMs: 12_000 },
    moles: {
      mode: "grid",
      rounds: 3,
      roundMs: 12_000,
      emoji: { target: ["🐹"], bonus: ["⭐"], decoy: ["💣"] },
    },
    reaction: { mode: "reaction", rounds: 5 },
  },
});
