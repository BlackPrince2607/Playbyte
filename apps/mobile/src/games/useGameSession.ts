import { useCallback, useRef } from "react";

/** Ensures onDone fires once — natural finish or End anytime. */
export function useGameSession(onDone: (score: number, durationMs: number) => void) {
  const started = useRef(Date.now());
  const finished = useRef(false);

  const finish = useCallback(
    (score: number) => {
      if (finished.current) return;
      finished.current = true;
      onDone(Math.max(0, Math.round(score)), Date.now() - started.current);
    },
    [onDone],
  );

  return { finish, startedAt: started };
}
