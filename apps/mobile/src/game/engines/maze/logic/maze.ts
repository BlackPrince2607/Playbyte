import type { Rng } from "../../../core/rng";

/** Wall bits per cell. A cell index is y * size + x. */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export type Dir = "N" | "E" | "S" | "W";
export const DIR_BIT: Record<Dir, number> = { N, E, S, W };
const OPPOSITE: Record<number, number> = { [N]: S, [S]: N, [E]: W, [W]: E };
const STEP: Record<number, [number, number]> = { [N]: [0, -1], [S]: [0, 1], [E]: [1, 0], [W]: [-1, 0] };
const BITS = [N, E, S, W];

export const xy = (i: number, size: number): [number, number] => [i % size, Math.floor(i / size)];

/** Neighbour of `i` through `bit`, or -1 at the border. */
export function neighbour(i: number, bit: number, size: number): number {
  const [x, y] = xy(i, size);
  const [dx, dy] = STEP[bit];
  const nx = x + dx;
  const ny = y + dy;
  return nx < 0 || ny < 0 || nx >= size || ny >= size ? -1 : ny * size + nx;
}

export const open = (walls: readonly number[], i: number, bit: number) => (walls[i] & bit) === 0;
const popcount = (w: number) => (w & 1) + ((w >> 1) & 1) + ((w >> 2) & 1) + ((w >> 3) & 1);
export const isDeadEnd = (walls: readonly number[], i: number) => popcount(walls[i]) === 3;

function carve(walls: number[], a: number, bit: number, size: number) {
  const b = neighbour(a, bit, size);
  walls[a] &= ~bit;
  walls[b] &= ~OPPOSITE[bit];
}

/**
 * MazeGenerator: iterative recursive-backtracker (a perfect maze: exactly one route between any two
 * cells), then braiding: each dead end is opened into a neighbour with probability `braid`, which
 * removes dead ends and adds loops (more branching, fewer traps).
 */
export function generateMaze(rng: Rng, size: number, braid: number): number[] {
  const walls = new Array<number>(size * size).fill(N | E | S | W);
  const seen = new Uint8Array(size * size);
  const stack = [rng.int(0, size * size - 1)];
  seen[stack[0]] = 1;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const options = BITS.filter((b) => {
      const n = neighbour(cur, b, size);
      return n >= 0 && !seen[n];
    });
    if (!options.length) {
      stack.pop();
      continue;
    }
    const bit = rng.pick(options);
    carve(walls, cur, bit, size);
    const next = neighbour(cur, bit, size);
    seen[next] = 1;
    stack.push(next);
  }
  if (braid > 0) {
    for (const i of rng.shuffle(Array.from({ length: size * size }, (_, k) => k))) {
      if (!isDeadEnd(walls, i) || !rng.chance(braid)) continue;
      const closed = BITS.filter((b) => !open(walls, i, b) && neighbour(i, b, size) >= 0);
      if (!closed.length) continue;
      const deadNeighbours = closed.filter((b) => isDeadEnd(walls, neighbour(i, b, size)));
      carve(walls, i, rng.pick(deadNeighbours.length ? deadNeighbours : closed), size);
    }
  }
  return walls;
}

/** BFS distances from `from` (-1 = unreachable). */
export function distances(walls: readonly number[], size: number, from: number): number[] {
  const dist = new Array<number>(walls.length).fill(-1);
  dist[from] = 0;
  const queue = [from];
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    for (const b of BITS) {
      if (!open(walls, c, b)) continue;
      const n = neighbour(c, b, size);
      if (n >= 0 && dist[n] < 0) {
        dist[n] = dist[c] + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}

/** Shortest route from a to b, inclusive of both ends. */
export function shortestPath(walls: readonly number[], size: number, a: number, b: number): number[] {
  const dist = distances(walls, size, b);
  if (dist[a] < 0) return [];
  const path = [a];
  let cur = a;
  while (cur !== b) {
    const next = BITS.map((bit) => (open(walls, cur, bit) ? neighbour(cur, bit, size) : -1)).find((n) => n >= 0 && dist[n] === dist[cur] - 1)!;
    path.push(next);
    cur = next;
  }
  return path;
}

/** Shortest tour a -> every stop (greedy nearest-first) -> b. Used for the gem variation's par. */
export function tourLength(walls: readonly number[], size: number, a: number, stops: readonly number[], b: number): number {
  let cur = a;
  let total = 0;
  const left = [...stops];
  while (left.length) {
    const d = distances(walls, size, cur);
    left.sort((p, q) => d[p] - d[q]);
    const next = left.shift()!;
    total += d[next];
    cur = next;
  }
  return total + distances(walls, size, cur)[b];
}

export const countDeadEnds = (walls: readonly number[]) => walls.reduce((n, _, i) => n + (isDeadEnd(walls, i) ? 1 : 0), 0);

/** From `from`, keep moving in `bit` until a junction, a turn-only corridor end, or a dead end. */
export function runFrom(walls: readonly number[], size: number, from: number, bit: number, stopAt: (i: number) => boolean): number[] {
  const cells: number[] = [];
  let cur = from;
  let dir = bit;
  while (open(walls, cur, dir)) {
    cur = neighbour(cur, dir, size);
    cells.push(cur);
    if (stopAt(cur)) break;
    const exits = BITS.filter((b) => b !== OPPOSITE[dir] && open(walls, cur, b));
    if (exits.length !== 1) break;
    dir = exits[0];
    if (cells.length > walls.length) break;
  }
  return cells;
}
