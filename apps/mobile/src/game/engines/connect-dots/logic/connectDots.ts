import { connectDotsMeta } from "../meta";
import { createConnectEngine } from "./engine";

export const connectDotsEngine = createConnectEngine(connectDotsMeta, {
  classic: { rounds: 3 },
  blitz: { rounds: 5, sizeDelta: -1, timeScale: 0.5 },
  big: { rounds: 2, sizeDelta: 2, timeScale: 1.2 },
});
