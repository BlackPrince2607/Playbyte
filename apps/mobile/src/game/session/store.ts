import { GameSession, KeyValueStore } from "./types";

const ACTIVE_KEY = "maja.game.session.active";
const LEVEL_PREFIX = "maja.game.level.";

export type SessionStore = {
  save(session: GameSession): Promise<void>;
  /** The resumable session, if any: live, schema-compatible and not older than maxAgeMs. */
  load(now?: number): Promise<GameSession | null>;
  clear(): Promise<void>;
};

/** Finished sessions, and ones the player never acted in, are not worth offering to resume. */
function worthResuming(s: GameSession): boolean {
  if (s.status === "completed" || s.status === "abandoned" || s.status === "ready") return false;
  return Array.isArray(s.actions) && s.actions.length > 0;
}

export function createSessionStore(kv: KeyValueStore, opts: { maxAgeMs?: number } = {}): SessionStore {
  const maxAgeMs = opts.maxAgeMs ?? 30 * 60_000;
  return {
    async save(session) {
      if (!worthResuming(session)) {
        await kv.removeItem(ACTIVE_KEY);
        return;
      }
      await kv.setItem(ACTIVE_KEY, JSON.stringify(session));
    },
    async load(now = Date.now()) {
      const raw = await kv.getItem(ACTIVE_KEY);
      if (!raw) return null;
      try {
        const s = JSON.parse(raw) as GameSession;
        const live = s && s.schemaVersion === 1 && typeof s.sessionId === "string" && s.engineState !== undefined;
        const fresh = typeof s.updatedAt === "number" && now - s.updatedAt <= maxAgeMs;
        if (live && fresh && worthResuming(s)) return s;
      } catch {
        // corrupted entry: fall through and clear
      }
      await kv.removeItem(ACTIVE_KEY);
      return null;
    },
    clear: () => kv.removeItem(ACTIVE_KEY),
  };
}

/** Remembers each player's difficulty level per engine/variation across sessions. */
export type LevelStore = {
  get(engine: string, variation: string): Promise<number | undefined>;
  set(engine: string, variation: string, level: number): Promise<void>;
};

export function createLevelStore(kv: KeyValueStore): LevelStore {
  const key = (e: string, v: string) => `${LEVEL_PREFIX}${e}.${v}`;
  return {
    async get(engine, variation) {
      const raw = await kv.getItem(key(engine, variation));
      const n = raw === null ? NaN : Number(raw);
      return Number.isFinite(n) && n >= 0 && n <= 1 ? n : undefined;
    },
    async set(engine, variation, level) {
      if (!Number.isFinite(level)) return;
      await kv.setItem(key(engine, variation), String(Math.min(1, Math.max(0, level))));
    },
  };
}
