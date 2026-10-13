import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import { getSoundPrefs, setSoundPrefs, SoundPrefs } from "../lib/storage";
import { MUSIC_SOURCES, SFX_SOURCES } from "./assets";
import { MUSIC_VOLUME, MusicKey, SFX_VOLUME, SfxKey } from "./catalog";

const FADE_MS = 500;
const FADE_STEPS = 10;
/** Music level while a game is paused. */
const DUCK = 0.35;

let prefs: SoundPrefs = { music: true, sfx: true };
let scene: MusicKey | null = null;
let ducked = false;
let foreground = AppState.currentState === "active";
let started = false;
let current: { key: MusicKey; player: AudioPlayer } | null = null;
const musicPlayers = new Map<MusicKey, AudioPlayer>();
const sfxPlayers = new Map<SfxKey, AudioPlayer>();
const fades = new Map<AudioPlayer, ReturnType<typeof setInterval>>();
const listeners = new Set<() => void>();

function stopFade(player: AudioPlayer) {
  const id = fades.get(player);
  if (id !== undefined) clearInterval(id);
  fades.delete(player);
}

function fade(player: AudioPlayer, to: number, then?: () => void) {
  stopFade(player);
  const from = player.volume;
  let step = 0;
  const id = setInterval(() => {
    step += 1;
    player.volume = from + (to - from) * (step / FADE_STEPS);
    if (step < FADE_STEPS) return;
    stopFade(player);
    then?.();
  }, FADE_MS / FADE_STEPS);
  fades.set(player, id);
}

function musicPlayer(key: MusicKey) {
  let p = musicPlayers.get(key);
  if (!p) {
    p = createAudioPlayer(MUSIC_SOURCES[key]);
    p.loop = true;
    p.volume = 0;
    musicPlayers.set(key, p);
  }
  return p;
}

function sfxPlayer(key: SfxKey) {
  let p = sfxPlayers.get(key);
  if (!p) {
    p = createAudioPlayer(SFX_SOURCES[key]);
    sfxPlayers.set(key, p);
  }
  return p;
}

/** Brings the playing track in line with the scene, prefs, pause state and app focus. */
function sync() {
  if (!started) return;
  const want = prefs.music && foreground ? scene : null;
  if (current && current.key !== want) {
    const old = current.player;
    fade(old, 0, () => old.pause());
    current = null;
  }
  if (!want) return;
  if (!current) {
    const p = musicPlayer(want);
    // Games start their track from the top; the app track picks up where it left off.
    if (want !== "home" && fades.get(p) === undefined) void p.seekTo(0).catch(() => {});
    current = { key: want, player: p };
    p.play();
  }
  fade(current.player, MUSIC_VOLUME[want] * (ducked ? DUCK : 1));
}

function emit() {
  for (const l of listeners) l();
}

/** Configures the audio session, loads saved prefs and starts the current scene. Safe to call more than once. */
export async function startSound() {
  if (started) return;
  started = true;
  await setAudioModeAsync({
    // iOS games follow the ring/silent switch; Android users control games with media volume.
    playsInSilentMode: Platform.OS !== "ios",
    interruptionMode: "mixWithOthers",
    shouldPlayInBackground: false,
  }).catch(() => {});
  prefs = await getSoundPrefs().catch(() => prefs);
  emit();
  for (const key of Object.keys(SFX_SOURCES) as SfxKey[]) sfxPlayer(key);
  AppState.addEventListener("change", (s) => {
    foreground = s === "active";
    if (!foreground && current) {
      stopFade(current.player);
      current.player.pause();
      current.player.volume = 0;
      current = null;
    }
    sync();
  });
  sync();
}

/** Which background track should play: the app track, a game's track, or none. */
export function setMusicScene(next: MusicKey | null) {
  scene = next;
  sync();
}

/** Lowers the music (e.g. while a game is paused) without stopping it. */
export function setMusicDucked(next: boolean) {
  if (ducked === next) return;
  ducked = next;
  sync();
}

export function playSfx(key: SfxKey) {
  if (!started || !prefs.sfx || !foreground) return;
  const p = sfxPlayer(key);
  p.volume = SFX_VOLUME[key];
  void p.seekTo(0).catch(() => {});
  p.play();
}

export function setSoundPref(key: keyof SoundPrefs, value: boolean) {
  prefs = { ...prefs, [key]: value };
  void setSoundPrefs(prefs).catch(() => {});
  emit();
  sync();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSoundPrefs(): SoundPrefs {
  return useSyncExternalStore(subscribe, () => prefs);
}
