import { CompletedPlay, KeyValueStore } from "./types";

const QUEUE_KEY = "playbyte.game.submitQueue";
const MAX_QUEUE = 50;
const MAX_ATTEMPTS = 8;

export type PendingPlay = CompletedPlay & { idempotencyKey: string; attempts: number; queuedAt: number };

/** Submitter throws; `permanent` errors (validation, unknown game) are dropped instead of retried. */
export type SubmitError = Error & { permanent?: boolean };

export type SubmitQueue<R> = {
  /** Persists the play first, then submits it. Resolves with the server response or rejects (play stays queued). */
  submit(play: CompletedPlay): Promise<R>;
  /** Retries everything queued (app start, regained connectivity). Returns how many were sent. */
  flush(): Promise<number>;
  pending(): Promise<PendingPlay[]>;
};

/** "queued": the play is stored on the phone and syncs later; "rejected": the server refused it. */
export type SaveState = "saved" | "queued" | "rejected";
export type SaveOutcome = {
  score: number;
  percentile: number | null;
  saveState: SaveState;
  saveMessage?: string;
  promptAccountCreation?: boolean;
};

/**
 * Submits a finished play and describes it for the result screen; never throws. A failed save keeps
 * the play queued for later unless the server rejected it, and a successful one retries older queued plays.
 */
export async function savePlay(
  queue: SubmitQueue<{ score: number; percentile: number; promptAccountCreation?: boolean }>,
  play: CompletedPlay,
  messageOf: (e: unknown) => string | undefined = () => undefined,
): Promise<SaveOutcome> {
  try {
    const res = await queue.submit(play);
    void queue.flush().catch(() => {});
    return { score: res.score, percentile: res.percentile, saveState: "saved", promptAccountCreation: res.promptAccountCreation };
  } catch (e) {
    if ((e as SubmitError)?.permanent === true) {
      return { score: play.score, percentile: null, saveState: "rejected", saveMessage: messageOf(e) };
    }
    return { score: play.score, percentile: null, saveState: "queued" };
  }
}

export function idempotencyKeyFor(play: Pick<CompletedPlay, "gameKey" | "sessionId">) {
  return `${play.gameKey}-${play.sessionId}`.slice(0, 128);
}

export function createSubmitQueue<R>(
  kv: KeyValueStore,
  send: (play: PendingPlay) => Promise<R>,
  now: () => number = () => Date.now(),
): SubmitQueue<R> {
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => {});
    return next;
  };

  async function read(): Promise<PendingPlay[]> {
    try {
      const raw = await kv.getItem(QUEUE_KEY);
      const list = raw ? (JSON.parse(raw) as PendingPlay[]) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }
  const write = (list: PendingPlay[]) => kv.setItem(QUEUE_KEY, JSON.stringify(list.slice(-MAX_QUEUE)));

  async function attempt(key: string): Promise<{ ok: true; value: R } | { ok: false; error: unknown }> {
    const list = await read();
    const item = list.find((p) => p.idempotencyKey === key);
    if (!item) return { ok: false, error: new Error("not queued") };
    try {
      const value = await send(item);
      await write((await read()).filter((p) => p.idempotencyKey !== key));
      return { ok: true, value };
    } catch (error) {
      const permanent = (error as SubmitError)?.permanent === true;
      const fresh = await read();
      const updated = fresh
        .map((p) => (p.idempotencyKey === key ? { ...p, attempts: p.attempts + 1 } : p))
        .filter((p) => !(p.idempotencyKey === key && (permanent || p.attempts >= MAX_ATTEMPTS)));
      await write(updated);
      return { ok: false, error };
    }
  }

  return {
    submit(play) {
      return serial(async () => {
        const key = idempotencyKeyFor(play);
        const list = (await read()).filter((p) => p.idempotencyKey !== key);
        list.push({ ...play, idempotencyKey: key, attempts: 0, queuedAt: now() });
        await write(list);
        const r = await attempt(key);
        if (r.ok) return r.value;
        throw r.error;
      });
    },
    flush() {
      return serial(async () => {
        let sent = 0;
        for (const p of await read()) {
          if ((await attempt(p.idempotencyKey)).ok) sent++;
        }
        return sent;
      });
    },
    pending: () => read(),
  };
}
