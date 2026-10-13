export type MusicKey = "home" | "think" | "calm" | "arcade";
export type SfxKey = "tick" | "tickUrgent" | "timeUp" | "correct" | "wrong" | "levelUp" | "complete";

const ENGINE_MUSIC: Record<string, MusicKey> = {
  guess: "think",
  emoji_guess: "think",
  odd_one_out: "think",
  fact_fake: "think",
  choice: "think",
  word_search: "calm",
  maze: "calm",
  connect_dots: "calm",
  spot_difference: "calm",
  tap: "arcade",
  tap_dont_tap: "arcade",
};

/** Background track for a game engine; unknown engines get the general game track. */
export function musicForEngine(engine?: string | null): MusicKey {
  return (engine && ENGINE_MUSIC[engine]) || "think";
}

/** Playback volumes (0–1) that even out the tracks and keep music under other app audio. */
export const MUSIC_VOLUME: Record<MusicKey, number> = { home: 0.32, think: 0.32, calm: 0.24, arcade: 0.3 };
export const SFX_VOLUME: Record<SfxKey, number> = {
  tick: 0.55,
  tickUrgent: 0.7,
  timeUp: 0.5,
  correct: 0.7,
  wrong: 0.5,
  levelUp: 0.7,
  complete: 0.8,
};

export const TIMER_WARN_SECONDS = 5;
export const TIMER_URGENT_SECONDS = 3;

/** Sound for a countdown that moved from `prev` to `next` whole seconds, or null when it should stay quiet. */
export function timerCue(prev: number, next: number): SfxKey | null {
  if (next >= prev) return null;
  if (next === 0) return "timeUp";
  if (next <= TIMER_URGENT_SECONDS) return "tickUrgent";
  if (next <= TIMER_WARN_SECONDS) return "tick";
  return null;
}
