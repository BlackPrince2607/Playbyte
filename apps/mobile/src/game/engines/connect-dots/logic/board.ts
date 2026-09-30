import type { Rng } from "../../../core/rng";

export type Board = { size: number; pairs: [number, number][]; solution: number[][] };

export const adjacent = (a: number, b: number, size: number) => {
  const ax = a % size;
  const ay = Math.floor(a / size);
  const bx = b % size;
  const by = Math.floor(b / size);
  return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
};

export function gridNeighbours(c: number, size: number): number[] {
  const x = c % size;
  const y = Math.floor(c / size);
  const out: number[] = [];
  if (y > 0) out.push(c - size);
  if (x < size - 1) out.push(c + 1);
  if (y < size - 1) out.push(c + size);
  if (x > 0) out.push(c - 1);
  return out;
}

/**
 * Random Hamiltonian path over the grid via "backbite" moves (Mansfield): start from a serpentine
 * and repeatedly join an end to one of its grid neighbours, reversing the loop that creates.
 */
export function hamiltonianPath(rng: Rng, size: number, iterations = size * size * 24): number[] {
  const path: number[] = [];
  for (let y = 0; y < size; y++) for (let k = 0; k < size; k++) path.push(y * size + (y % 2 ? size - 1 - k : k));
  const idx = new Array<number>(path.length);
  path.forEach((c, i) => (idx[c] = i));
  const last = path.length - 1;
  const reverse = (lo: number, hi: number) => {
    for (; lo < hi; lo++, hi--) {
      const t = path[lo];
      path[lo] = path[hi];
      path[hi] = t;
      idx[path[lo]] = lo;
      idx[path[hi]] = hi;
    }
  };
  for (let n = 0; n < iterations; n++) {
    if (rng.chance(0.5)) {
      const options = gridNeighbours(path[0], size).filter((c) => c !== path[1]);
      reverse(0, idx[rng.pick(options)] - 1);
    } else {
      const options = gridNeighbours(path[last], size).filter((c) => c !== path[last - 1]);
      reverse(idx[rng.pick(options)] + 1, last);
    }
  }
  return path;
}

/** Splits `total` into `k` parts, each >= `min`, uniformly over compositions. */
function composition(rng: Rng, total: number, k: number, min: number): number[] {
  const spare = total - k * min;
  const cuts = Array.from({ length: k - 1 }, () => rng.int(0, spare)).sort((a, b) => a - b);
  const parts: number[] = [];
  let prev = 0;
  for (const c of [...cuts, spare]) {
    parts.push(min + c - prev);
    prev = c;
  }
  return parts;
}

/** Straight segments are trivial to spot; count direction changes. */
function turns(seg: number[], size: number): number {
  let n = 0;
  for (let i = 2; i < seg.length; i++) if (seg[i] - seg[i - 1] !== seg[i - 1] - seg[i - 2]) n++;
  return n;
}

/**
 * BoardGenerator: a Hamiltonian path cut into `pairCount` segments; segment ends become the dots.
 * The segments themselves are a full-coverage solution, so every board is solvable and can be
 * filled completely. Boards with adjacent pair ends or too many dead-straight segments are
 * regenerated (the best of `attempts` is kept).
 */
export function generateBoard(rng: Rng, size: number, pairCount: number, minLen = 3, attempts = 12): Board {
  const cells = size * size;
  const k = Math.max(2, Math.min(pairCount, Math.floor(cells / minLen)));
  let best: Board | null = null;
  let bestScore = -Infinity;
  for (let a = 0; a < attempts; a++) {
    const path = hamiltonianPath(rng, size);
    const lengths = composition(rng, cells, k, minLen);
    const solution: number[][] = [];
    let at = 0;
    for (const len of lengths) {
      solution.push(path.slice(at, at + len));
      at += len;
    }
    const adjacentEnds = solution.filter((s) => adjacent(s[0], s[s.length - 1], size)).length;
    const straight = solution.filter((s) => turns(s, size) === 0).length;
    const score = -adjacentEnds * 3 - straight;
    if (score > bestScore) {
      bestScore = score;
      best = { size, pairs: solution.map((s) => [s[0], s[s.length - 1]] as [number, number]), solution };
    }
    if (score === 0) break;
  }
  return best!;
}
