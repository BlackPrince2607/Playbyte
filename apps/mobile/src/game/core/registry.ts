import { EngineMeta } from "./engine";

/**
 * Registry of engines by id. Registration stores only lightweight metadata and a loader; the engine
 * module (logic + UI) is evaluated on first launch, never at app startup.
 */
export type EngineRegistration<M> = {
  meta: Pick<EngineMeta, "id" | "title" | "variations" | "interaction">;
  load: () => Promise<M>;
};

export type EngineRegistry<M> = {
  register(reg: EngineRegistration<M>): void;
  has(id: string): boolean;
  meta(id: string): EngineRegistration<M>["meta"] | undefined;
  list(): EngineRegistration<M>["meta"][];
  load(id: string): Promise<M>;
  /** Drop a loaded module reference (tests, memory pressure). */
  evict(id: string): void;
};

export function createRegistry<M>(): EngineRegistry<M> {
  const regs = new Map<string, EngineRegistration<M>>();
  const loaded = new Map<string, Promise<M>>();

  return {
    register(reg) {
      if (regs.has(reg.meta.id)) throw new Error(`Engine already registered: ${reg.meta.id}`);
      regs.set(reg.meta.id, reg);
    },
    has: (id) => regs.has(id),
    meta: (id) => regs.get(id)?.meta,
    list: () => [...regs.values()].map((r) => r.meta),
    load(id) {
      const reg = regs.get(id);
      if (!reg) return Promise.reject(new Error(`Unknown engine: ${id}`));
      let p = loaded.get(id);
      if (!p) {
        p = reg.load().catch((e) => {
          loaded.delete(id);
          throw e;
        });
        loaded.set(id, p);
      }
      return p;
    },
    evict(id) {
      loaded.delete(id);
    },
  };
}
