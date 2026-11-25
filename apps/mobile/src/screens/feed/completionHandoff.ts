/**
 * In-feed completion must always (re)schedule the result handoff when status is
 * "completed". Side effects (feedback, level persist) run once.
 *
 * Bug: early-return on a finished flag skipped rescheduling after clearTimeout when
 * FeedScreen re-rendered (live unlock → new onComplete identity). Result screen never opened.
 */
export function completionHandoffPlan(status: string, sideEffectsDone: boolean): {
  runSideEffects: boolean;
  scheduleHandoff: boolean;
} {
  if (status !== "completed") return { runSideEffects: false, scheduleHandoff: false };
  return { runSideEffects: !sideEffectsDone, scheduleHandoff: true };
}
