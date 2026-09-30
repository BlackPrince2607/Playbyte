import type { EngineMeta } from "../core/engine";
import type { EngineModule } from "../ui/types";
import { choiceMeta } from "./choice/meta";
import { connectDotsMeta } from "./connect-dots/meta";
import { emojiGuessMeta } from "./emoji-guess/meta";
import { factFakeMeta } from "./fact-fake/meta";
import { guessMeta } from "./guess/meta";
import { engineRegistry } from "./index";
import { mazeMeta } from "./maze/meta";
import { oddOneOutMeta } from "./odd-one-out/meta";
import { spotMeta } from "./spot-difference/meta";
import { tapDontTapMeta } from "./tap-dont-tap/meta";
import { tapMeta } from "./tap/meta";
import { wordSearchMeta } from "./word-search/meta";

/**
 * Engine registrations: metadata is imported eagerly (tiny), logic + UI load on first launch.
 * Adding an engine = one entry here plus the engine folder.
 */
const ENGINES: { meta: EngineMeta; load: () => Promise<{ default: EngineModule }> }[] = [
  { meta: guessMeta, load: () => import("./guess") },
  { meta: emojiGuessMeta, load: () => import("./emoji-guess") },
  { meta: oddOneOutMeta, load: () => import("./odd-one-out") },
  { meta: tapMeta, load: () => import("./tap") },
  { meta: wordSearchMeta, load: () => import("./word-search") },
  { meta: spotMeta, load: () => import("./spot-difference") },
  { meta: factFakeMeta, load: () => import("./fact-fake") },
  { meta: choiceMeta, load: () => import("./choice") },
  { meta: tapDontTapMeta, load: () => import("./tap-dont-tap") },
  { meta: mazeMeta, load: () => import("./maze") },
  { meta: connectDotsMeta, load: () => import("./connect-dots") },
];

let registered = false;

export function registerEngines() {
  if (registered) return;
  registered = true;
  for (const e of ENGINES) engineRegistry.register({ meta: e.meta, load: () => e.load().then((m) => m.default) });
}
