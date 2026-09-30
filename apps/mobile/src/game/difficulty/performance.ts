import { ActionOutcome } from "../core/types";
import { PlayerPerformance } from "./types";

const EWMA_ALPHA = 0.3;
const RECENT_WINDOW = 10;

export function emptyPerformance(): PlayerPerformance {
  return {
    attempts: 0,
    correct: 0,
    mistakes: 0,
    streak: 0,
    bestStreak: 0,
    accuracyEwma: 0.5,
    responseMsEwma: 0,
    recent: [],
    hintsUsed: 0,
    roundsCompleted: 0,
  };
}

export function recordOutcome(perf: PlayerPerformance, o: ActionOutcome): PlayerPerformance {
  const streak = o.correct ? perf.streak + 1 : 0;
  const responseMs = Math.max(0, o.responseMs);
  return {
    attempts: perf.attempts + 1,
    correct: perf.correct + (o.correct ? 1 : 0),
    mistakes: perf.mistakes + (o.correct ? 0 : 1) + (o.mistakes ?? 0),
    streak,
    bestStreak: Math.max(perf.bestStreak, streak),
    accuracyEwma: perf.attempts === 0 ? (o.correct ? 1 : 0) : perf.accuracyEwma + EWMA_ALPHA * ((o.correct ? 1 : 0) - perf.accuracyEwma),
    responseMsEwma: perf.attempts === 0 ? responseMs : perf.responseMsEwma + EWMA_ALPHA * (responseMs - perf.responseMsEwma),
    recent: [...perf.recent, o.correct].slice(-RECENT_WINDOW),
    hintsUsed: perf.hintsUsed + (o.hintUsed ? 1 : 0),
    roundsCompleted: perf.roundsCompleted,
  };
}

export function completeRound(perf: PlayerPerformance): PlayerPerformance {
  return { ...perf, roundsCompleted: perf.roundsCompleted + 1 };
}

export function recentAccuracy(perf: PlayerPerformance): number {
  if (!perf.recent.length) return perf.accuracyEwma;
  return perf.recent.filter(Boolean).length / perf.recent.length;
}
