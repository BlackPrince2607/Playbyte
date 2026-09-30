import type { KeyValueStore } from "../session/types";
import type { EventSink } from "./bus";
import type { GameEvent } from "./events";

const QUEUE_KEY = "playbyte.game.events";

/** Per-interaction events; ANSWER_SUBMITTED and ROUND_COMPLETED carry the same information at a fraction of the volume. */
const DROPPED: ReadonlySet<GameEvent["type"]> = new Set(["ACTION_PERFORMED", "ANSWER_CORRECT", "ANSWER_WRONG"]);
/** Session boundaries flush right away so a finished game's events reach the server promptly. */
const FLUSH_ON: ReadonlySet<GameEvent["type"]> = new Set(["GAME_COMPLETED", "GAME_ABANDONED", "GAME_ERROR"]);

/** `send` throws; errors marked `permanent` (malformed batch) drop the batch instead of retrying it. */
export type SendError = Error & { permanent?: boolean };

export type BatchSinkOptions = {
  storage: KeyValueStore;
  send(events: GameEvent[]): Promise<void>;
  /** Events per request; reaching it triggers a flush. */
  batchSize?: number;
  /** Oldest events are dropped beyond this, so an offline device cannot grow the queue without bound. */
  maxQueue?: number;
  /** Coalesces storage writes; events emitted within this window are persisted together. */
  persistDelayMs?: number;
  now?: () => number;
};

export type BatchSink = {
  sink: EventSink;
  /** Sends queued events in batches until the queue is empty or a request fails. Returns how many were sent. */
  flush(): Promise<number>;
  /** Writes the in-memory queue to storage now (app backgrounding). */
  persist(): Promise<void>;
  size(): number;
};

export function createBatchSink(opts: BatchSinkOptions): BatchSink {
  const batchSize = opts.batchSize ?? 50;
  const maxQueue = opts.maxQueue ?? 500;
  const persistDelayMs = opts.persistDelayMs ?? 1500;
  const now = opts.now ?? (() => Date.now());

  let queue: GameEvent[] = [];
  let failures = 0;
  let retryAt = 0;
  let inflight: Promise<number> | null = null;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  const hydrated = (async () => {
    try {
      const raw = await opts.storage.getItem(QUEUE_KEY);
      const saved = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(saved)) queue = [...(saved as GameEvent[]), ...queue].slice(-maxQueue);
    } catch {
      // A corrupt queue is not worth crashing for; start empty.
    }
  })();

  async function persist() {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    await hydrated;
    try {
      if (queue.length) await opts.storage.setItem(QUEUE_KEY, JSON.stringify(queue));
      else await opts.storage.removeItem(QUEUE_KEY);
    } catch {
      // Storage full or unavailable: events stay in memory for this run.
    }
  }

  function persistSoon() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      void persist();
    }, persistDelayMs);
    (persistTimer as { unref?: () => void }).unref?.();
  }

  async function drain(): Promise<number> {
    await hydrated;
    let sent = 0;
    while (queue.length && now() >= retryAt) {
      const batch = queue.slice(0, batchSize);
      try {
        await opts.send(batch);
        failures = 0;
        sent += batch.length;
      } catch (e) {
        if ((e as SendError)?.permanent !== true) {
          failures++;
          retryAt = now() + Math.min(60_000, 2_000 * 2 ** (failures - 1));
          break;
        }
      }
      const done = new Set(batch);
      queue = queue.filter((ev) => !done.has(ev));
    }
    await persist();
    return sent;
  }

  function flush(): Promise<number> {
    if (!inflight) inflight = drain().finally(() => (inflight = null));
    return inflight;
  }

  const sink: EventSink = (event) => {
    if (DROPPED.has(event.type)) return;
    queue.push(event);
    if (queue.length > maxQueue) queue = queue.slice(-maxQueue);
    if (queue.length >= batchSize || FLUSH_ON.has(event.type)) void flush();
    else persistSoon();
  };

  return { sink, flush, persist, size: () => queue.length };
}
