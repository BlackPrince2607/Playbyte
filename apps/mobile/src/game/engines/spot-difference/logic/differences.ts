import type { Rng } from "../../../core/rng";
import { ASPECT, Scene, Shape, ShapeKind, hexToHsl, hslToHex } from "./scene";

export type DiffKind = "missing" | "color" | "size" | "move" | "rotate" | "shape";

/** A difference and its hit box: centre (x, y) and half-extents (hw, hh), normalised coordinates. */
export type Difference = { id: string; kind: DiffKind; x: number; y: number; hw: number; hh: number; side: "left" | "right" };

export const inRegion = (d: Difference, x: number, y: number, slop = 0) => Math.abs(x - d.x) <= d.hw + slop && Math.abs(y - d.y) <= d.hh + slop;

const overlaps = (a: Difference, b: Pick<Difference, "x" | "y" | "hw" | "hh">) =>
  Math.abs(a.x - b.x) < a.hw + b.hw && Math.abs(a.y - b.y) < a.hh + b.hh;

export type SpotParams = {
  diffCount: number;
  shapeCount: number;
  /** 0 = obvious changes, 1 = subtle ones. */
  subtlety: number;
  minSize: number;
  timeLimitMs: number;
};

/** Hit boxes are never smaller than this half-size (touch target on a ~360pt wide image). */
export const MIN_REGION = 0.05;
const PAD = 0.012;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const extent = (s: Shape) => Math.max(s.hw, s.hh);

/** Share of `s`'s bounding box covered by shapes drawn after it. */
function occlusion(s: Shape, later: Shape[]): number {
  let covered = 0;
  const area = 4 * s.hw * s.hh;
  for (const o of later) {
    if (o.kind === "ring") continue; // outline only
    const w = Math.min(s.x + s.hw, o.x + o.hw) - Math.max(s.x - s.hw, o.x - o.hw);
    const h = Math.min(s.y + s.hh, o.y + o.hh) - Math.max(s.y - s.hh, o.y - o.hh);
    if (w > 0 && h > 0) covered += w * h;
  }
  return Math.min(1, covered / area);
}

const inBounds = (s: Shape) => s.x - s.hw >= 0 && s.x + s.hw <= 1 && s.y - s.hh >= 0 && s.y + s.hh <= ASPECT;

type Edit = { kind: DiffKind; apply(s: Shape): Shape | null; shift?: number };

function editsFor(s: Shape, p: SpotParams, rng: Rng): Edit[] {
  const t = p.subtlety;
  const edits: Edit[] = [
    { kind: "missing", apply: () => null },
    {
      kind: "color",
      apply: (sh) => {
        const [h, sat, l] = hexToHsl(sh.color);
        if (t < 0.5 && sat > 0.15) return { ...sh, color: hslToHex(h + lerp(180, 70, t * 2), Math.max(sat, 0.6), l) };
        const dl = lerp(0.32, 0.16, t) * (l > 0.5 ? -1 : 1);
        return { ...sh, color: hslToHex(h + (sat > 0.15 ? 25 : 0), sat, Math.max(0.08, Math.min(0.92, l + dl))) };
      },
    },
    {
      kind: "size",
      apply: (sh) => {
        const k = rng.chance(0.5) ? lerp(1.65, 1.3, t) : lerp(0.5, 0.72, t);
        return { ...sh, hw: sh.hw * k, hh: sh.hh * k };
      },
    },
  ];
  const shift = lerp(0.085, 0.04, t);
  edits.push({
    kind: "move",
    shift,
    apply: (sh) => {
      const a = rng.int(0, 7) * (Math.PI / 4);
      return { ...sh, x: sh.x + Math.cos(a) * shift, y: sh.y + Math.sin(a) * shift };
    },
  });
  if (s.kind === "tri" || s.kind === "star" || s.kind === "diamond" || (s.kind === "rect" && Math.abs(s.hw - s.hh) > 0.01)) {
    edits.push({ kind: "rotate", apply: (sh) => ({ ...sh, rot: sh.rot + (s.kind === "star" ? 36 : s.kind === "tri" ? 180 : 90) }) });
  }
  const swap: Partial<Record<ShapeKind, ShapeKind>> = { circle: "rect", rect: "circle", tri: "diamond", diamond: "tri", star: "circle" };
  if (swap[s.kind] && Math.abs(s.hw - s.hh) < 0.01) edits.push({ kind: "shape", apply: (sh) => ({ ...sh, kind: swap[sh.kind]! }) });
  return edits;
}

/**
 * DifferenceGenerator: applies `diffCount` visible, well-separated edits to copies of `base`.
 * Each edit lands on a random side, so players have to compare both pictures.
 */
export function makeDifferences(base: Scene, p: SpotParams, rng: Rng): { left: Scene; right: Scene; diffs: Difference[] } {
  const left = base.shapes.map((s) => ({ ...s }));
  const right = base.shapes.map((s) => ({ ...s }));
  const diffs: Difference[] = [];
  const order = new Map(base.shapes.map((s, i) => [s.id, i]));
  const candidates = rng.shuffle(
    base.shapes.filter((s, i) => !s.fixed && extent(s) >= p.minSize && occlusion(s, base.shapes.slice(i + 1)) < 0.35),
  );

  for (const s of candidates) {
    if (diffs.length >= p.diffCount) break;
    const edits = rng.shuffle(editsFor(s, p, rng));
    for (const e of edits) {
      const edited = e.apply({ ...s });
      if (edited && !inBounds(edited)) continue;
      // Rotation can swing corners outside the unrotated box; cover the circumscribed square.
      const ext = (sh: Shape) => (sh.rot % 90 !== 0 || e.kind === "rotate" ? [extent(sh), extent(sh)] : [sh.hw, sh.hh]);
      const [w0, h0] = ext(s);
      const [w1, h1] = edited ? ext(edited) : [w0, h0];
      const x0 = Math.min(s.x - w0, (edited ?? s).x - w1);
      const x1 = Math.max(s.x + w0, (edited ?? s).x + w1);
      const y0 = Math.min(s.y - h0, (edited ?? s).y - h1);
      const y1 = Math.max(s.y + h0, (edited ?? s).y + h1);
      const box = {
        x: (x0 + x1) / 2,
        y: (y0 + y1) / 2,
        hw: Math.max(MIN_REGION, (x1 - x0) / 2 + PAD),
        hh: Math.max(MIN_REGION, (y1 - y0) / 2 + PAD),
      };
      if (diffs.some((d) => overlaps(d, box))) break;
      if (e.kind === "size" && extent(s) > 0.12) continue;
      const side = rng.chance(0.5) ? "left" : "right";
      const target = side === "left" ? left : right;
      const idx = order.get(s.id)!;
      if (edited) target[idx] = edited;
      else target[idx] = { ...target[idx], hw: 0, hh: 0 };
      diffs.push({ id: `d${s.id}`, kind: e.kind, ...box, side });
      break;
    }
  }
  const strip = (arr: Shape[]) => arr.filter((s) => s.hw > 0 && s.hh > 0);
  return { left: { bg: base.bg, shapes: strip(left) }, right: { bg: base.bg, shapes: strip(right) }, diffs };
}
