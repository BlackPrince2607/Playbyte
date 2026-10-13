#!/usr/bin/env node
/**
 * Synthesizes the app's music loops and sound effects and encodes them to mono AAC (.m4a) with ffmpeg.
 *
 *   node scripts/generate-audio.mjs
 *
 * Output goes to assets/audio/{music,sfx}. Rendering is deterministic, so edit a track below and re-run.
 * Real recordings can replace any file as long as the name stays the same (see src/audio/assets.ts).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SR = 24000;
const TAU = Math.PI * 2;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "assets", "audio");

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const rand = makeRng(7);
const NOISE = Float32Array.from({ length: SR }, () => rand() * 2 - 1);

/** Attack/decay/sustain envelope held for `d` seconds, then a linear release of `r`. */
function adsr(t, d, a, dec, s, r) {
  if (t < 0) return 0;
  let v;
  if (t < a) v = t / a;
  else if (t < a + dec) v = 1 - (1 - s) * ((t - a) / dec);
  else v = s;
  if (t > d) v *= Math.max(0, 1 - (t - d) / r);
  return v;
}

// Instruments: (freq, t, durationSec) => sample. `tail` is how long they ring after the note ends.
const inst = {
  epiano: {
    tail: 0.6,
    fn: (f, t, d) =>
      (Math.sin(TAU * f * t) + 0.3 * Math.exp(-3 * t) * Math.sin(TAU * 2 * f * t)) * adsr(t, d, 0.006, 1.2, 0.35, 0.5),
  },
  pluck: {
    tail: 0.3,
    fn: (f, t) => {
      const tri = (2 / Math.PI) * Math.asin(Math.sin(TAU * f * t));
      return (tri + 0.2 * Math.sin(TAU * 2 * f * t)) * Math.exp(-7 * t) * Math.min(1, t / 0.003);
    },
  },
  marimba: {
    tail: 0.4,
    fn: (f, t) => (Math.sin(TAU * f * t) + 0.25 * Math.exp(-12 * t) * Math.sin(TAU * 4 * f * t)) * Math.exp(-6 * t) * Math.min(1, t / 0.002),
  },
  bell: {
    tail: 1.6,
    fn: (f, t) =>
      (Math.sin(TAU * f * t) + 0.35 * Math.exp(-4 * t) * Math.sin(TAU * 2.76 * f * t)) * Math.exp(-2.4 * t) * Math.min(1, t / 0.003),
  },
  pad: {
    tail: 1.4,
    fn: (f, t, d) => {
      let v = 0;
      for (const det of [0.994, 1, 1.006]) {
        v += Math.sin(TAU * f * det * t) + 0.45 * Math.sin(TAU * 2 * f * det * t) + 0.2 * Math.sin(TAU * 3 * f * det * t);
      }
      return (v / 3) * adsr(t, d, 0.9, 0.5, 0.85, 1.2);
    },
  },
  square: {
    tail: 0.08,
    fn: (f, t, d) => {
      let v = 0;
      for (let k = 1; k <= 9; k += 2) if (k * f < SR / 2) v += Math.sin(TAU * k * f * t) / k;
      return v * adsr(t, d, 0.004, 0.08, 0.6, 0.06);
    },
  },
  bass: {
    tail: 0.12,
    fn: (f, t, d) => (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * 2 * f * t)) * adsr(t, d, 0.005, 0.15, 0.7, 0.1),
  },
  chipBass: {
    tail: 0.05,
    fn: (f, t, d) => {
      let v = 0;
      for (let k = 1; k <= 5; k += 2) v += Math.sin(TAU * k * f * t) / k;
      return v * adsr(t, d, 0.003, 0.05, 0.7, 0.04);
    },
  },
  sub: {
    tail: 0.8,
    fn: (f, t, d) => Math.sin(TAU * f * t) * adsr(t, d, 0.6, 0.3, 0.9, 0.8),
  },
};

// Drums: (t, noiseOffset) => sample.
const drums = {
  kick: { len: 0.35, fn: (t) => Math.sin(TAU * (45 * t + (75 * (1 - Math.exp(-30 * t))) / 30)) * Math.exp(-9 * t) },
  snare: {
    len: 0.25,
    fn: (t, o) => {
      const i = Math.floor(t * SR) + o;
      const n = NOISE[i % SR] - NOISE[(i + SR - 1) % SR];
      return 0.5 * n * Math.exp(-18 * t) + 0.5 * Math.sin(TAU * 185 * t) * Math.exp(-25 * t);
    },
  },
  hat: {
    len: 0.06,
    fn: (t, o) => {
      const i = Math.floor(t * SR) + o;
      return (NOISE[i % SR] - NOISE[(i + SR - 1) % SR]) * Math.exp(-70 * t);
    },
  },
  shaker: {
    len: 0.12,
    fn: (t, o) => {
      const i = Math.floor(t * SR) + o;
      return (NOISE[i % SR] - NOISE[(i + SR - 1) % SR]) * Math.min(1, t / 0.02) * Math.exp(-30 * t);
    },
  },
};

function renderInto(buf, startSec, lenSec, fn, gain) {
  const s0 = Math.round(startSec * SR);
  const n = Math.min(buf.length - s0, Math.ceil(lenSec * SR));
  for (let i = 0; i < n; i++) buf[s0 + i] += gain * fn(i / SR);
}

function feedbackDelay(buf, delaySec, feedback) {
  const d = Math.round(delaySec * SR);
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] + (i >= d ? out[i - d] * feedback : 0);
  return out;
}

function lowpass(buf, cutoffHz) {
  const a = 1 - Math.exp((-TAU * cutoffHz) / SR);
  let y = 0;
  for (let i = 0; i < buf.length; i++) buf[i] = y += a * (buf[i] - y);
  return buf;
}

function normalize(buf, peak) {
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] / max) * peak;
  return buf;
}

/** Renders a seamless loop: tails that ring past the end are folded back onto the start. */
function renderLoop({ bpm, bars, delayBeats = 0.75, feedback = 0.3, wetMix = 0.35, cutoff = 7000, build }) {
  const beat = 60 / bpm;
  const loopLen = Math.round(bars * 4 * beat * SR);
  const tail = 4 * SR;
  const dry = new Float32Array(loopLen + tail);
  const wet = new Float32Array(loopLen + tail);
  let hits = 0;
  const api = {
    note(name, atBeat, lenBeats, midi, gain, { send = 0 } = {}) {
      const { fn, tail: ring } = inst[name];
      const d = lenBeats * beat;
      const f = hz(midi);
      renderInto(dry, atBeat * beat, d + ring, (t) => fn(f, t, d), gain * (1 - send));
      if (send) renderInto(wet, atBeat * beat, d + ring, (t) => fn(f, t, d), gain * send);
    },
    hit(name, atBeat, gain) {
      const { fn, len } = drums[name];
      const o = (hits++ * 4099) % SR;
      renderInto(dry, atBeat * beat, len, (t) => fn(t, o), gain);
    },
  };
  build(api);
  const echoed = feedbackDelay(wet, delayBeats * beat, feedback);
  const mix = new Float32Array(loopLen);
  for (let i = 0; i < loopLen + tail; i++) {
    const v = dry[i] + echoed[i] * (1 + wetMix);
    mix[i % loopLen] += v;
  }
  return normalize(lowpass(mix, cutoff), 0.89);
}

function renderOneShot(seconds, build) {
  const buf = new Float32Array(Math.ceil(seconds * SR));
  build({
    note(name, atSec, lenSec, midi, gain) {
      const { fn, tail } = inst[name];
      const f = hz(midi);
      renderInto(buf, atSec, lenSec + tail, (t) => fn(f, t, lenSec), gain);
    },
    tone(atSec, lenSec, fn, gain) {
      renderInto(buf, atSec, lenSec, fn, gain);
    },
  });
  const fadeN = Math.min(buf.length, Math.round(0.01 * SR));
  for (let i = 0; i < fadeN; i++) buf[buf.length - 1 - i] *= i / fadeN;
  return normalize(buf, 0.85);
}

// ---------- Music ----------

const music = {
  /** Feed and app tabs: laid-back lo-fi keys. */
  home: () =>
    renderLoop({
      bpm: 84,
      bars: 8,
      cutoff: 5000,
      build: ({ note, hit }) => {
        const chords = [
          [53, 57, 60, 64],
          [52, 55, 59, 62],
          [50, 53, 57, 60],
          [48, 52, 55, 59],
        ];
        const roots = [41, 40, 38, 36];
        for (let bar = 0; bar < 8; bar++) {
          const c = chords[bar >> 1];
          const b = bar * 4;
          for (const m of c) {
            note("epiano", b, 1.5, m, 0.12, { send: 0.3 });
            note("epiano", b + 2.5, 1.2, m, 0.08, { send: 0.3 });
          }
          note("bass", b, 1.5, roots[bar >> 1], 0.36);
          note("bass", b + 2.5, 1, roots[bar >> 1], 0.26);
          hit("kick", b, 0.5);
          hit("kick", b + 2.5, 0.4);
          hit("snare", b + 1, 0.16);
          hit("snare", b + 3, 0.16);
          for (let e = 0; e < 8; e++) hit("hat", b + e / 2 + (e % 2 ? 0.08 : 0), e % 2 ? 0.05 : 0.07);
        }
        const melody = [
          [1, 72, 1], [2, 76, 1.5], [6, 74, 1], [7, 72, 1], [9, 71, 1], [10, 74, 2], [13, 69, 1], [14, 72, 1.5],
          [17, 69, 1], [18, 72, 1], [19, 74, 1.5], [22, 76, 1], [23, 74, 1], [25, 72, 1], [26, 71, 1.5], [29, 67, 1], [30, 71, 2],
        ];
        for (const [at, m, len] of melody) note("bell", at, len, m, 0.1, { send: 0.6 });
      },
    }),

  /** Quiz-style games: bright, bouncy, "thinking" groove. */
  think: () =>
    renderLoop({
      bpm: 112,
      bars: 8,
      delayBeats: 0.5,
      feedback: 0.25,
      build: ({ note, hit }) => {
        const chords = [
          [60, 64, 67],
          [55, 59, 62],
          [57, 60, 64],
          [53, 57, 60],
        ];
        const roots = [36, 43, 45, 41];
        for (let bar = 0; bar < 8; bar++) {
          const [a, b2, c] = chords[bar >> 1];
          const arp = [a, b2, c, a + 12, c, b2, a + 12, b2];
          const b = bar * 4;
          arp.forEach((m, i) => note("pluck", b + i / 2, 0.4, m, 0.08, { send: 0.3 }));
          for (const at of [0, 1.5, 2, 3]) note("bass", b + at, 0.4, roots[bar >> 1], 0.3);
          hit("kick", b, 0.55);
          hit("kick", b + 2, 0.5);
          hit("snare", b + 1, 0.22);
          hit("snare", b + 3, 0.22);
          for (let e = 0; e < 8; e++) hit("hat", b + e / 2, e % 2 ? 0.07 : 0.04);
        }
        const melody = [
          [0, 76, 0.5], [0.5, 79, 0.5], [1, 84, 1], [2.5, 79, 0.5], [3, 76, 1], [5, 72, 0.5], [5.5, 74, 0.5], [6, 76, 1.5],
          [8, 74, 0.5], [8.5, 79, 0.5], [9, 83, 1], [10.5, 79, 0.5], [11, 74, 1], [13, 71, 0.5], [13.5, 74, 0.5], [14, 79, 1.5],
          [16, 76, 0.5], [16.5, 81, 0.5], [17, 84, 1], [18.5, 81, 0.5], [19, 76, 1], [21, 72, 0.5], [21.5, 76, 0.5], [22, 81, 1.5],
          [24, 77, 0.5], [24.5, 81, 0.5], [25, 84, 1], [26.5, 81, 0.5], [27, 77, 1], [29, 79, 0.5], [29.5, 76, 0.5], [30, 74, 1], [31, 72, 1],
        ];
        for (const [at, m, len] of melody) note("marimba", at, len, m, 0.13, { send: 0.25 });
      },
    }),

  /** Puzzles (word search, maze, dots, spot the difference): calm ambient pads and bells. */
  calm: () =>
    renderLoop({
      bpm: 72,
      bars: 8,
      delayBeats: 1.5,
      feedback: 0.4,
      cutoff: 4500,
      build: ({ note, hit }) => {
        const chords = [
          [57, 60, 64, 67, 71],
          [53, 57, 60, 64],
          [48, 55, 59, 64],
          [55, 59, 62, 64],
        ];
        const roots = [45, 41, 36, 43];
        for (let pair = 0; pair < 4; pair++) {
          const c = chords[pair];
          for (const m of c.slice(0, 4)) note("pad", pair * 8, 8, m, 0.06, { send: 0.2 });
          note("sub", pair * 8, 8, roots[pair] - 12, 0.22);
        }
        for (let bar = 0; bar < 8; bar++) {
          const c = chords[bar >> 1];
          const b = bar * 4;
          [0, 1.5, 3].forEach((at, k) => note("bell", b + at, 1, c[(bar * 3 + k) % c.length] + 12, 0.07, { send: 0.6 }));
          for (let q = 0; q < 4; q++) hit("shaker", b + q + 0.5, 0.025);
        }
      },
    }),

  /** Reflex games (tap, tap-don't-tap): fast chiptune. */
  arcade: () =>
    renderLoop({
      bpm: 140,
      bars: 8,
      delayBeats: 0.75,
      feedback: 0.2,
      wetMix: 0.2,
      build: ({ note, hit }) => {
        const roots = [45, 41, 48, 43];
        const chords = [
          [57, 60, 64],
          [53, 57, 60],
          [60, 64, 67],
          [55, 59, 62],
        ];
        for (let bar = 0; bar < 8; bar++) {
          const r = roots[bar >> 1];
          const b = bar * 4;
          for (let e = 0; e < 8; e++) note("chipBass", b + e / 2, 0.4, e % 2 ? r + 12 : r, 0.2);
          for (const m of chords[bar >> 1]) note("pluck", b + 0.5, 0.3, m, 0.05);
          for (let q = 0; q < 4; q++) hit("kick", b + q, 0.55);
          hit("snare", b + 1, 0.3);
          hit("snare", b + 3, 0.3);
          for (let q = 0; q < 4; q++) hit("hat", b + q + 0.5, 0.08);
        }
        const melody = [
          [0, 69, 0.5], [0.5, 72, 0.5], [1, 76, 0.5], [1.5, 72, 0.5], [2, 74, 1], [3, 72, 0.5], [3.5, 69, 0.5], [4, 76, 0.75], [5, 79, 0.5], [5.5, 76, 0.5], [6, 74, 1], [7, 72, 1],
          [8, 77, 0.5], [8.5, 76, 0.5], [9, 72, 0.5], [9.5, 69, 0.5], [10, 72, 1], [11, 74, 0.5], [11.5, 76, 0.5], [12, 77, 0.75], [13, 76, 0.5], [13.5, 74, 0.5], [14, 72, 2],
          [16, 76, 0.5], [16.5, 79, 0.5], [17, 84, 0.5], [17.5, 79, 0.5], [18, 76, 1], [19, 74, 0.5], [19.5, 72, 0.5], [20, 74, 0.75], [21, 76, 0.5], [21.5, 79, 0.5], [22, 81, 2],
          [24, 79, 0.5], [24.5, 81, 0.5], [25, 79, 0.5], [25.5, 76, 0.5], [26, 74, 1], [27, 76, 0.5], [27.5, 74, 0.5], [28, 71, 1], [29, 74, 0.5], [29.5, 76, 0.5], [30, 79, 0.5], [30.5, 81, 1.5],
        ];
        for (const [at, m, len] of melody) note("square", at, len * 0.9, m, 0.09, { send: 0.3 });
      },
    }),
};

// ---------- Sound effects ----------

const glide = (f0, f1, len) => (t) => TAU * (f0 * t + ((f1 - f0) * t * t) / (2 * len));

const sfx = {
  tick: () =>
    renderOneShot(0.1, ({ tone }) => {
      tone(0, 0.1, (t) => Math.sin(TAU * 1000 * t) * Math.exp(-55 * t), 1);
      tone(0, 0.01, (t) => NOISE[Math.floor(t * SR)] * Math.exp(-400 * t), 0.3);
    }),
  "tick-urgent": () =>
    renderOneShot(0.14, ({ tone }) => {
      tone(0, 0.14, (t) => (Math.sin(TAU * 1480 * t) + 0.5 * Math.sin(TAU * 740 * t)) * Math.exp(-35 * t), 1);
    }),
  "time-up": () =>
    renderOneShot(0.75, ({ note, tone }) => {
      note("square", 0, 0.18, 72, 0.6);
      const p = glide(392, 300, 0.4);
      tone(0.24, 0.45, (t) => {
        let v = 0;
        for (let k = 1; k <= 7; k += 2) v += Math.sin(k * p(t)) / k;
        return v * adsr(t, 0.4, 0.005, 0.1, 0.7, 0.05);
      }, 0.6);
    }),
  correct: () =>
    renderOneShot(0.6, ({ note }) => {
      note("bell", 0, 0.08, 84, 0.6);
      note("bell", 0.08, 0.2, 91, 0.7);
    }),
  wrong: () =>
    renderOneShot(0.35, ({ tone }) => {
      const p = glide(220, 140, 0.3);
      tone(0, 0.3, (t) => {
        let v = 0;
        for (let k = 1; k <= 5; k += 2) v += Math.sin(k * p(t)) / k;
        return v * adsr(t, 0.22, 0.005, 0.05, 0.8, 0.08);
      }, 0.7);
      tone(0, 0.15, (t) => Math.sin(TAU * 90 * t) * Math.exp(-20 * t), 0.5);
    }),
  "level-up": () =>
    renderOneShot(0.9, ({ note }) => {
      [72, 76, 79, 84].forEach((m, i) => note("marimba", i * 0.07, 0.1, m, 0.6));
      note("bell", 0.28, 0.3, 88, 0.5);
    }),
  complete: () =>
    renderOneShot(1.6, ({ note }) => {
      [72, 76, 79].forEach((m, i) => note("pluck", i * 0.1, 0.1, m, 0.6));
      for (const m of [72, 76, 79, 84]) note("bell", 0.32, 0.6, m, 0.35);
      note("pad", 0.32, 0.6, 60, 0.3);
    }),
};

// ---------- Output ----------

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

function encode(samples, dest, bitrate) {
  const tmp = path.join(os.tmpdir(), `maja-${path.basename(dest)}.wav`);
  fs.writeFileSync(tmp, wav(samples));
  const res = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", tmp, "-c:a", "aac", "-b:a", bitrate, "-ac", "1", dest], {
    stdio: "inherit",
  });
  fs.rmSync(tmp, { force: true });
  if (res.status !== 0) throw new Error(`ffmpeg failed for ${dest}`);
  const kb = (fs.statSync(dest).size / 1024).toFixed(1);
  console.log(`  ${path.relative(root, dest)}  ${(samples.length / SR).toFixed(1)}s  ${kb} KB`);
}

for (const dir of ["music", "sfx"]) fs.mkdirSync(path.join(outDir, dir), { recursive: true });
console.log("Rendering music…");
for (const [name, render] of Object.entries(music)) encode(render(), path.join(outDir, "music", `${name}.m4a`), "40k");
console.log("Rendering sound effects…");
for (const [name, render] of Object.entries(sfx)) encode(render(), path.join(outDir, "sfx", `${name}.m4a`), "64k");
