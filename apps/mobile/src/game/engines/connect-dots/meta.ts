import type { EngineMeta } from "../../core/engine";

export const connectDotsMeta: EngineMeta = {
  id: "connect_dots",
  title: "Connect the Dots",
  version: 1,
  interaction: "grid",
  scoreDirection: "higher_is_better",
  roundEndDelayMs: 1800,
  variations: [
    { id: "classic", title: "Connect", description: "Join every pair without crossing lines", categories: ["puzzle"] },
    { id: "blitz", title: "Connect Blitz", description: "Five small boards, short clock", categories: ["puzzle"] },
    { id: "big", title: "Connect XL", description: "Two big boards for patient minds", categories: ["puzzle"] },
  ],
};
