import { createRegistry } from "../core/registry";
import type { EngineModule } from "../ui/types";

/**
 * App-wide engine registry. Only metadata and loaders live here — importing this file evaluates no
 * engine logic or UI. Engines register themselves in ./manifest.ts.
 */
export const engineRegistry = createRegistry<EngineModule>();
