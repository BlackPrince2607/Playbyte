/**
 * Session clock measuring *active* play time. Pausing (app backgrounded, pause menu) stops it, so
 * deadlines and durations never count time the player could not act.
 */
export interface SessionClock {
  now(): number;
  pause(): void;
  resume(): void;
  readonly paused: boolean;
}

export function createClock(opts: { source?: () => number; elapsedMs?: number; paused?: boolean } = {}): SessionClock {
  const source = opts.source ?? (() => Date.now());
  let base = opts.elapsedMs ?? 0;
  let resumedAt = source();
  let paused = opts.paused ?? false;

  return {
    now: () => (paused ? base : base + (source() - resumedAt)),
    pause() {
      if (paused) return;
      base += source() - resumedAt;
      paused = true;
    },
    resume() {
      if (!paused) return;
      resumedAt = source();
      paused = false;
    },
    get paused() {
      return paused;
    },
  };
}

/** Manually advanced clock for tests and deterministic replays. */
export function createManualClock(start = 0): SessionClock & { advance(ms: number): void } {
  let t = start;
  let paused = false;
  return {
    now: () => t,
    advance(ms: number) {
      if (!paused) t += ms;
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    get paused() {
      return paused;
    },
  };
}
