import type { ContentItem } from "../../../content/types";
import { Difference, MIN_REGION } from "./differences";
import { ASPECT } from "./scene";

export type OverlayOp = "blob" | "ring" | "dim" | "bright" | "badge" | "hide";

export type SpotOverlay = {
  id: string;
  side: "left" | "right";
  op: OverlayOp;
  color: string;
};

export type SpotPair = {
  id: string;
  title: string;
  leftUrl: string;
  rightUrl: string;
  aspect: number;
  difficulty: number;
  diffs: Difference[];
  overlays: SpotOverlay[];
};

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const https = (u: unknown): u is string => typeof u === "string" && /^https:\/\//.test(u);
const OPS: OverlayOp[] = ["blob", "ring", "dim", "bright", "badge", "hide"];

const overlaps = (a: Difference, b: Difference) =>
  Math.abs(a.x - b.x) < a.hw + b.hw && Math.abs(a.y - b.y) < a.hh + b.hh;

function parseDiff(raw: unknown, i: number): Difference | null {
  if (!isObj(raw)) return null;
  const { x, y, hw, hh } = raw;
  if (typeof x !== "number" || typeof y !== "number" || typeof hw !== "number" || typeof hh !== "number") return null;
  if (![x, y, hw, hh].every((n) => Number.isFinite(n))) return null;
  const id = typeof raw.id === "string" && raw.id ? raw.id : `d${i + 1}`;
  const box: Difference = {
    id,
    kind: "missing",
    x,
    y,
    hw: Math.max(MIN_REGION, hw),
    hh: Math.max(MIN_REGION, hh),
    side: "right",
  };
  if (box.x - box.hw < -1e-6 || box.x + box.hw > 1 + 1e-6) return null;
  if (box.y - box.hh < -1e-6 || box.y + box.hh > ASPECT + 1e-6) return null;
  return box;
}

function parseOverlay(raw: unknown, fallbackId: string): SpotOverlay | null {
  if (!isObj(raw)) return null;
  const id = typeof raw.id === "string" && raw.id ? raw.id : fallbackId;
  const side = raw.side === "left" || raw.side === "right" ? raw.side : null;
  const op = typeof raw.op === "string" && OPS.includes(raw.op as OverlayOp) ? (raw.op as OverlayOp) : null;
  const color = typeof raw.color === "string" && raw.color ? raw.color : "#FFD84D";
  if (!side || !op) return null;
  return { id, side, op, color };
}

/** Parse a content item into a playable photo pair, or null if malformed. */
export function pairFromItem(item: ContentItem): SpotPair | null {
  const media = item.media ?? [];
  const images = media.filter((m): m is { kind: "image"; url: string } => m.kind === "image" && https(m.url));
  const attrs = item.attributes;
  const leftUrl = https(attrs.leftUrl) ? attrs.leftUrl : images[0]?.url;
  const rightUrl = https(attrs.rightUrl) ? attrs.rightUrl : images[1]?.url ?? images[0]?.url;
  if (!leftUrl || !rightUrl) return null;

  const rawDiffs = attrs.diffs;
  if (!Array.isArray(rawDiffs) || rawDiffs.length < 3) return null;
  const diffs: Difference[] = [];
  for (let i = 0; i < rawDiffs.length; i++) {
    const d = parseDiff(rawDiffs[i], i);
    if (!d) return null;
    if (diffs.some((o) => overlaps(o, d))) return null;
    diffs.push(d);
  }

  const rawOverlays = attrs.overlays;
  const overlays: SpotOverlay[] = [];
  if (Array.isArray(rawOverlays)) {
    for (let i = 0; i < rawOverlays.length; i++) {
      const o = parseOverlay(rawOverlays[i], diffs[i]?.id ?? `d${i + 1}`);
      if (o) overlays.push(o);
    }
  }
  // Default: alternate sides with a blob so a pack without overlays still looks different.
  if (!overlays.length) {
    diffs.forEach((d, i) => overlays.push({ id: d.id, side: i % 2 === 0 ? "right" : "left", op: "blob", color: "#FF4D8D" }));
  }

  const aspect = typeof attrs.aspect === "number" && attrs.aspect > 0.3 && attrs.aspect < 1.2 ? attrs.aspect : ASPECT;
  const title = typeof attrs.title === "string" ? attrs.title : item.id;
  return { id: item.id, title, leftUrl, rightUrl, aspect, difficulty: item.difficulty, diffs, overlays };
}
