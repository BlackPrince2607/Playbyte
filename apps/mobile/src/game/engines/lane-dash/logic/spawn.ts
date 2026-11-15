import type { Rng } from "../../../core/rng";

export type Obstacle = {
  id: number;
  lane: 0 | 1 | 2;
  /** 0 = horizon, 1 = player line. */
  y: number;
  /** Units of y advanced per second at base speed 1. */
  speed: number;
  kind: "bar" | "wide";
  scored: boolean;
  nearMissed: boolean;
};

export type SpawnPlan = {
  /** Absolute session ms when this obstacle appears at y=0. */
  at: number;
  lane: 0 | 1 | 2;
  kind: "bar" | "wide";
  speed: number;
};

/** Pre-schedule obstacles for a finite run so ticks stay deterministic. */
export function planSpawns(rng: Rng, roundStart: number, limitMs: number, density: number): SpawnPlan[] {
  const plans: SpawnPlan[] = [];
  let t = roundStart + 900;
  let idPace = Math.max(420, Math.round(780 - density * 280));
  while (t < roundStart + limitMs - 600) {
    const twin = rng.chance(0.18 + density * 0.12);
    const laneA = rng.int(0, 2) as 0 | 1 | 2;
    plans.push({
      at: t,
      lane: laneA,
      kind: rng.chance(0.12) ? "wide" : "bar",
      speed: 0.55 + density * 0.45 + rng.next() * 0.15,
    });
    if (twin) {
      const laneB = ([0, 1, 2] as const).filter((l) => l !== laneA)[rng.int(0, 1)] as 0 | 1 | 2;
      plans.push({
        at: t + rng.int(40, 120),
        lane: laneB,
        kind: "bar",
        speed: 0.55 + density * 0.45 + rng.next() * 0.12,
      });
    }
    // Never block all three lanes at once in a tight window.
    idPace = Math.max(360, idPace - 4);
    t += idPace + rng.int(0, 90);
  }
  return plans;
}

export function activateDue(
  plans: readonly SpawnPlan[],
  spawned: number,
  now: number,
  nextId: number,
): { obstacles: Obstacle[]; spawned: number; nextId: number } {
  const obstacles: Obstacle[] = [];
  let i = spawned;
  let id = nextId;
  while (i < plans.length && plans[i].at <= now) {
    const p = plans[i];
    obstacles.push({
      id: id++,
      lane: p.lane,
      y: 0,
      speed: p.speed,
      kind: p.kind,
      scored: false,
      nearMissed: false,
    });
    i++;
  }
  return { obstacles, spawned: i, nextId: id };
}
