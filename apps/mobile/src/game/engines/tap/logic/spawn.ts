import type { Rng } from "../../../core/rng";
import type { TapParams, TapTarget, TargetKind } from "./types";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type SpawnOptions = {
  start: number;
  roundMs: number;
  firstId: number;
  /** Cells per side for grid ("whack") layouts; 0 = free placement. */
  grid: number;
  emoji?: { target: string[]; bonus: string[]; decoy: string[] };
};

/**
 * TargetSpawnGenerator: a deterministic schedule for one round. Respects `maxAlive`, keeps live
 * targets apart (or in distinct grid cells) and mixes in bonus/decoy targets by ratio.
 */
export function spawnTargets(rng: Rng, p: TapParams, o: SpawnOptions): TapTarget[] {
  const out: TapTarget[] = [];
  const alive = (t: number) => out.filter((x) => x.at <= t && t < x.at + x.ttl);
  let t = 300 + rng.int(0, 200);
  let id = o.firstId;

  while (t + 250 < o.roundMs) {
    const abs = o.start + t;
    let live = alive(abs);
    if (live.length >= p.maxAlive) {
      const freeAt = Math.min(...live.map((x) => x.at + x.ttl));
      t = freeAt - o.start + 1;
      continue;
    }
    const roll = rng.next();
    const kind: TargetKind = roll < p.decoyRatio ? "decoy" : roll < p.decoyRatio + p.bonusRatio ? "bonus" : "target";
    const r = kind === "bonus" ? p.targetSize * 0.8 : p.targetSize;
    const ttl = Math.round(kind === "bonus" ? p.ttlMs * 0.7 : p.ttlMs);
    live = alive(abs);

    let x = 0.5;
    let y = 0.5;
    let x2 = 0.5;
    let y2 = 0.5;
    if (o.grid > 0) {
      const taken = new Set(live.map((l) => `${Math.floor(l.x * o.grid)},${Math.floor(l.y * o.grid)}`));
      const free: [number, number][] = [];
      for (let cx = 0; cx < o.grid; cx++) for (let cy = 0; cy < o.grid; cy++) if (!taken.has(`${cx},${cy}`)) free.push([cx, cy]);
      if (!free.length) {
        t += 100;
        continue;
      }
      const [cx, cy] = rng.pick(free);
      x = x2 = (cx + 0.5) / o.grid;
      y = y2 = (cy + 0.5) / o.grid;
    } else {
      let best: [number, number] = [0.5, 0.5];
      let bestGap = -1;
      for (let i = 0; i < 12; i++) {
        const cx = r + rng.next() * (1 - 2 * r);
        const cy = r + rng.next() * (1 - 2 * r);
        const gap = live.length ? Math.min(...live.map((l) => Math.hypot(l.x - cx, l.y - cy) - l.r - r)) : 1;
        if (gap > bestGap) {
          best = [cx, cy];
          bestGap = gap;
        }
        if (gap > r) break;
      }
      [x, y] = best;
      x2 = clamp(x + (rng.next() * 2 - 1) * p.drift, r, 1 - r);
      y2 = clamp(y + (rng.next() * 2 - 1) * p.drift, r, 1 - r);
    }

    const pool = o.emoji?.[kind];
    out.push({ id: id++, kind, x, y, x2, y2, r, at: abs, ttl, emoji: pool?.length ? rng.pick(pool) : undefined });
    t += Math.round(p.spawnMs * (0.7 + rng.next() * 0.6));
  }
  return out;
}

/** Targets on screen at `now` that have not been resolved. */
export function visibleTargets(targets: readonly TapTarget[], done: readonly number[], now: number): TapTarget[] {
  return targets.filter((t) => t.at <= now && now < t.at + t.ttl && !done.includes(t.id));
}

/** Interpolated position of a drifting target. */
export function positionAt(t: TapTarget, now: number): { x: number; y: number } {
  const k = clamp((now - t.at) / t.ttl, 0, 1);
  return { x: t.x + (t.x2 - t.x) * k, y: t.y + (t.y2 - t.y) * k };
}
