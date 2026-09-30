import type { Rng } from "../../../core/rng";

/** Scene height as a fraction of its width; all coordinates are normalised to the width. */
export const ASPECT = 0.625;

export type ShapeKind = "circle" | "rect" | "tri" | "star" | "diamond" | "ring";

/** A primitive centred at (x, y) with half-extents (hw, hh) and rotation in degrees. */
export type Shape = {
  id: number;
  kind: ShapeKind;
  x: number;
  y: number;
  hw: number;
  hh: number;
  rot: number;
  color: string;
  /** Background pieces (sky, ground, stems) never carry a difference. */
  fixed?: boolean;
};

export type Scene = { bg: string; shapes: Shape[] };

export type SceneTheme = (rng: Rng, count: number) => Scene;

// ---- colour helpers (pure; Skia receives hex strings) ----

export function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

// ---- themes ----

function maker() {
  let id = 0;
  return (s: Omit<Shape, "id">): Shape => ({ id: id++, ...s });
}
const between = (rng: Rng, a: number, b: number) => a + rng.next() * (b - a);

const NEON = ["#FF4D8D", "#C6FF3D", "#7FDBFF", "#FFD84D", "#B28DFF", "#FF8A3D", "#3DFFB5", "#F5F0FF"];

function shapesTheme(rng: Rng, count: number): Scene {
  const shape = maker();
  const kinds: ShapeKind[] = ["circle", "rect", "tri", "star", "diamond", "ring"];
  const shapes: Shape[] = [];
  for (let i = 0; i < count; i++) {
    const size = between(rng, 0.028, 0.075);
    const kind = rng.pick(kinds);
    const hh = kind === "rect" ? size * between(rng, 0.6, 1.4) : size;
    shapes.push(
      shape({
        kind,
        x: between(rng, size, 1 - size),
        y: between(rng, hh, ASPECT - hh),
        hw: size,
        hh,
        rot: kind === "circle" || kind === "ring" ? 0 : rng.int(0, 7) * 45,
        color: rng.pick(NEON),
      }),
    );
  }
  return { bg: "#1d1340", shapes };
}

function cityTheme(rng: Rng, count: number): Scene {
  const shape = maker();
  const shapes: Shape[] = [shape({ kind: "rect", x: 0.5, y: ASPECT - 0.03, hw: 0.5, hh: 0.03, rot: 0, color: "#0e0a1f", fixed: true })];
  shapes.push(shape({ kind: "circle", x: between(rng, 0.1, 0.9), y: between(rng, 0.08, 0.14), hw: 0.045, hh: 0.045, rot: 0, color: "#F5F0FF" }));
  for (let i = 0; i < 6; i++) shapes.push(shape({ kind: "star", x: between(rng, 0.04, 0.96), y: between(rng, 0.03, 0.2), hw: 0.014, hh: 0.014, rot: 0, color: "#F5F0FF" }));
  const tones = ["#3b2f6b", "#4a3d80", "#2d2456", "#5a4a94"];
  let x = 0.02;
  const windowsBudget = Math.max(6, count - 12);
  let windows = 0;
  while (x < 0.96) {
    const hw = between(rng, 0.045, 0.085);
    const hh = between(rng, 0.1, 0.22);
    const cx = Math.min(0.97 - hw, x + hw);
    const cy = ASPECT - 0.06 - hh;
    shapes.push(shape({ kind: "rect", x: cx, y: cy, hw, hh, rot: 0, color: rng.pick(tones) }));
    const cols = hw > 0.065 ? 2 : 1;
    const rows = Math.floor((hh * 2 - 0.04) / 0.06);
    for (let r = 0; r < rows && windows < windowsBudget; r++)
      for (let c = 0; c < cols && windows < windowsBudget; c++) {
        if (rng.chance(0.35)) continue;
        const wx = cols === 1 ? cx : cx + (c === 0 ? -hw * 0.45 : hw * 0.45);
        shapes.push(shape({ kind: "rect", x: wx, y: cy - hh + 0.04 + r * 0.06, hw: 0.016, hh: 0.02, rot: 0, color: rng.chance(0.7) ? "#FFD84D" : "#7FDBFF" }));
        windows++;
      }
    x = cx + hw + between(rng, 0.004, 0.02);
  }
  return { bg: "#1b1440", shapes };
}

function gardenTheme(rng: Rng, count: number): Scene {
  const shape = maker();
  const shapes: Shape[] = [shape({ kind: "rect", x: 0.5, y: ASPECT - 0.09, hw: 0.5, hh: 0.09, rot: 0, color: "#3f9b45", fixed: true })];
  shapes.push(shape({ kind: "circle", x: between(rng, 0.08, 0.25), y: 0.1, hw: 0.055, hh: 0.055, rot: 0, color: "#FFD84D" }));
  for (let i = 0; i < 2; i++) {
    const cx = between(rng, 0.4, 0.9);
    const cy = between(rng, 0.07, 0.15);
    shapes.push(shape({ kind: "circle", x: cx, y: cy, hw: 0.04, hh: 0.04, rot: 0, color: "#ffffff" }));
    shapes.push(shape({ kind: "circle", x: cx + 0.04, y: cy + 0.01, hw: 0.032, hh: 0.032, rot: 0, color: "#ffffff" }));
  }
  const petals = ["#FF4D8D", "#FFD84D", "#B28DFF", "#FF8A3D", "#ffffff", "#7FDBFF"];
  const flowers = Math.max(4, Math.floor((count - 6) / 3));
  for (let i = 0; i < flowers; i++) {
    const fx = 0.08 + ((i + 0.5) / flowers) * 0.84 + between(rng, -0.015, 0.015);
    const fy = between(rng, 0.3, ASPECT - 0.14);
    const size = between(rng, 0.03, 0.05);
    shapes.push(shape({ kind: "rect", x: fx, y: (fy + ASPECT - 0.05) / 2, hw: 0.004, hh: (ASPECT - 0.05 - fy) / 2, rot: 0, color: "#2e7d32", fixed: true }));
    shapes.push(shape({ kind: rng.chance(0.5) ? "star" : "circle", x: fx, y: fy, hw: size, hh: size, rot: 0, color: rng.pick(petals) }));
    shapes.push(shape({ kind: "circle", x: fx, y: fy, hw: size * 0.4, hh: size * 0.4, rot: 0, color: rng.chance(0.5) ? "#FFD84D" : "#6b3e1f" }));
  }
  for (let i = 0; i < 2; i++) {
    const bx = between(rng, 0.2, 0.8);
    const by = between(rng, 0.2, 0.3);
    const c = rng.pick(petals);
    shapes.push(shape({ kind: "tri", x: bx - 0.018, y: by, hw: 0.018, hh: 0.018, rot: 90, color: c }));
    shapes.push(shape({ kind: "tri", x: bx + 0.018, y: by, hw: 0.018, hh: 0.018, rot: 270, color: c }));
  }
  return { bg: "#9fd8ff", shapes };
}

function spaceTheme(rng: Rng, count: number): Scene {
  const shape = maker();
  const shapes: Shape[] = [];
  const stars = Math.max(8, count - 18);
  for (let i = 0; i < stars; i++) {
    const s = between(rng, 0.01, 0.024);
    shapes.push(shape({ kind: "star", x: between(rng, 0.03, 0.97), y: between(rng, 0.03, ASPECT - 0.03), hw: s, hh: s, rot: rng.int(0, 4) * 18, color: rng.chance(0.7) ? "#F5F0FF" : "#FFD84D" }));
  }
  const planets = ["#FF8A3D", "#7FDBFF", "#B28DFF", "#C6FF3D", "#FF4D8D"];
  for (let i = 0; i < 3; i++) {
    const r = between(rng, 0.045, 0.08);
    const px = between(rng, 0.15, 0.85);
    const py = between(rng, 0.12, ASPECT - 0.12);
    shapes.push(shape({ kind: "circle", x: px, y: py, hw: r, hh: r, rot: 0, color: rng.pick(planets) }));
    if (rng.chance(0.6)) shapes.push(shape({ kind: "ring", x: px, y: py, hw: r * 1.6, hh: r * 0.45, rot: rng.int(-2, 2) * 10, color: "#F5F0FF" }));
    if (rng.chance(0.5)) shapes.push(shape({ kind: "circle", x: px + r * 1.5, y: py - r, hw: r * 0.28, hh: r * 0.28, rot: 0, color: "#cfc6e8" }));
  }
  const rocks = ["#8a7f9e", "#a89b8c", "#6f6a80"];
  for (let i = 0; i < 4; i++) {
    const s = between(rng, 0.018, 0.03);
    shapes.push(shape({ kind: "circle", x: between(rng, 0.05, 0.95), y: between(rng, 0.05, ASPECT - 0.05), hw: s, hh: s, rot: 0, color: rng.pick(rocks) }));
  }
  const rx = between(rng, 0.15, 0.85);
  const ry = between(rng, 0.2, ASPECT - 0.15);
  shapes.push(shape({ kind: "rect", x: rx, y: ry, hw: 0.02, hh: 0.05, rot: 0, color: "#e6e6f0" }));
  shapes.push(shape({ kind: "tri", x: rx, y: ry - 0.068, hw: 0.02, hh: 0.02, rot: 0, color: "#FF4D8D" }));
  shapes.push(shape({ kind: "circle", x: rx, y: ry - 0.012, hw: 0.009, hh: 0.009, rot: 0, color: "#7FDBFF" }));
  shapes.push(shape({ kind: "tri", x: rx, y: ry + 0.06, hw: 0.016, hh: 0.014, rot: 180, color: "#FF8A3D" }));
  return { bg: "#0b0820", shapes };
}

export const THEMES: Record<string, SceneTheme> = {
  shapes: shapesTheme,
  city: cityTheme,
  garden: gardenTheme,
  space: spaceTheme,
};
