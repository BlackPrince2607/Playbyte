import { useEffect, useState } from "react";

/**
 * Re-renders with the session clock while `active`. `intervalMs` 0 = every animation frame
 * (reaction timing); otherwise a coarse interval (spawn visibility).
 */
export function useClock(now: () => number, active: boolean, intervalMs = 50): number {
  const [t, setT] = useState(now);
  useEffect(() => {
    setT(now());
    if (!active) return;
    if (intervalMs <= 0) {
      let id = requestAnimationFrame(function loop() {
        setT(now());
        id = requestAnimationFrame(loop);
      });
      return () => cancelAnimationFrame(id);
    }
    const id = setInterval(() => setT(now()), intervalMs);
    return () => clearInterval(id);
  }, [now, active, intervalMs]);
  return t;
}
